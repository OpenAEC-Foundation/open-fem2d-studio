"""
FastAPI backend for the OpenSees-based FEM solver + Claude AI agent.

Provides endpoints:
  POST /api/solve         -- Run FEM analysis
  POST /api/chat          -- AI agent via Claude CLI (virtual terminal)
  GET  /api/erpnext/projects -- Search ERPNext projects
  GET  /api/erpnext/project/{name} -- Get ERPNext project details

Uses openseespy for the analysis engine. Since openseespy uses global state,
a threading lock serialises concurrent requests.

The AI agent uses the `claude` CLI as a virtual terminal subprocess.
No Anthropic SDK required — only the claude CLI installed globally.
"""

import os
import subprocess
import threading
import traceback
import json
import re
from typing import Any, Dict, List, Optional

import requests as http_requests
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

try:
    import openseespy.opensees as ops
    from model_builder import build_model
    from result_extractor import extract_results
    OPENSEES_AVAILABLE = True
except ImportError:
    OPENSEES_AVAILABLE = False

app = FastAPI(title="Open FEM2D Solver Backend")

# -- ERPNext configuration ---------------------------------------------------
ERPNEXT_URL = os.environ.get("ERPNEXT_URL", "")
ERPNEXT_API_KEY = os.environ.get("ERPNEXT_API_KEY", "")
ERPNEXT_API_SECRET = os.environ.get("ERPNEXT_API_SECRET", "")

# CORS for local development (Vite dev server on port 3000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# OpenSeesPy uses global state -- serialise access
_solver_lock = threading.Lock()


# -- Virtual Terminal System Prompt ------------------------------------------

SYSTEM_PROMPT = """You are a structural engineering AI assistant integrated into Open-FEM2D-Studio, a 2D finite element analysis application.

You operate as a virtual terminal: you receive the current model state and user instructions, and you respond with both explanatory text AND structured commands that the application executes.

## COMMAND FORMAT
When you need to modify the model, output commands inside a JSON code block with the marker <!--COMMANDS-->:

<!--COMMANDS-->
```json
[
  {"cmd": "command_name", "args": {"param1": "value1", "param2": "value2"}}
]
```

## AVAILABLE COMMANDS

### Model Creation
- `clear_model` — Clear entire model
- `add_node` — args: `x` (m), `y` (m) → returns node_id
- `add_beam` — args: `node1_id`, `node2_id`, `profile_name?` (e.g. "IPE200")
- `add_support` — args: `node_id`, `type` ("pinned"|"roller"|"fixed"|"roller_x")
- `set_profile` — args: `beam_id`, `profile_name`
- `set_end_releases` — args: `beam_id`, `start_moment_released?` (bool), `end_moment_released?` (bool)

### Loads
- `add_distributed_load` — args: `beam_id`, `qy_start` (N/m), `qy_end?` (N/m), `start_t?` (0-1), `end_t?` (0-1), `load_case_id?`, `coord_system?` ("local"|"global")
- `add_point_load` — args: `node_id`, `fx?` (N), `fy?` (N), `mz?` (Nm), `load_case_id?`
- `add_load_case` — args: `name`, `type?` ("permanent"|"live"|"wind"|"snow"|"other")

### Parametric Structures
- `create_structure` — args: `type` ("simply_supported"|"cantilever"|"portal_frame"|"truss"|"continuous_beam"), `span` (m), `height?` (m), `profile?`, `num_panels?`, `num_spans?`, `load_qy?` (kN/m, positive=downward), `point_load?` (kN, positive=downward)

### Analysis
- `run_analysis` — Run the FEM solver
- `get_results` — args: `beam_id?` — Get analysis results
- `optimize_profile` — args: `beam_id`, `criterion` ("weight"|"deflection"|"UC"|"stress"), `series?` ("IPE"|"HEA"|"HEB"), `max_uc?`

### Deletion
- `delete_element` — args: `element_type` ("beam"|"node"|"distributed_load"|"point_load"), `id`

## UNITS
- Internal: N, m, Pa, N/m, Nm
- User-facing: kN, kNm, mm, MPa, kN/m
- Convert: 10 kN/m = 10000 N/m, 50 kN = 50000 N
- Sign: negative qy = downward (gravity), positive fy = upward

## STEEL PROFILES
IPE: 80-600 | HEA: 100-1000 | HEB: 100-1000 | HEM: 100-1000

## LANGUAGE
Respond in the same language the user writes in (Dutch or English).

## ENGINEERING
- Know Eurocode: NEN-EN 1993 (steel), NEN-EN 1992 (concrete), NEN-EN 1990/1991
- Explain engineering decisions
- For gravity: use NEGATIVE qy values
- Simply supported: pinned + roller
- Cantilever: fixed at one end
- Truss: set moment releases (hinges) on all members

## IMPORTANT
- Always output commands in the <!--COMMANDS--> JSON block format
- You can combine text explanation with commands in one response
- Node and beam IDs start from 1 and increment
- When creating structures manually, create nodes first, then beams, then supports, then loads
"""


# -- Request / Response models -----------------------------------------------

class SolveRequest(BaseModel):
    nodes: List[Dict[str, Any]]
    beams: List[Dict[str, Any]]
    materials: List[Dict[str, Any]]
    analysisType: str = "frame"
    geometricNonlinear: bool = False


class SolveResponse(BaseModel):
    success: bool
    displacements: Optional[List[float]] = None
    reactions: Optional[List[float]] = None
    beamForces: Optional[Dict[str, Any]] = None
    nodeIdOrder: Optional[List[int]] = None
    error: Optional[str] = None


class ChatRequest(BaseModel):
    message: str
    model_state: Optional[Dict[str, Any]] = None
    conversation_history: Optional[List[Dict[str, Any]]] = None


class ChatResponse(BaseModel):
    response: Optional[str] = None
    commands: Optional[List[Dict[str, Any]]] = None
    error: Optional[str] = None


# -- Endpoints ---------------------------------------------------------------

@app.get("/api/health")
def health():
    # Check if claude CLI is available
    claude_available = False
    try:
        result = subprocess.run(
            ["claude", "--version"],
            capture_output=True, text=True, timeout=5
        )
        claude_available = result.returncode == 0
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass

    return {
        "status": "ok",
        "opensees": OPENSEES_AVAILABLE,
        "claude_cli": claude_available,
    }


@app.post("/api/solve", response_model=SolveResponse)
def solve(req: SolveRequest):
    if not OPENSEES_AVAILABLE:
        return SolveResponse(success=False, error="OpenSeesPy not available")

    with _solver_lock:
        try:
            data = req.model_dump()

            # Build the OpenSeesPy model (calls ops.wipe + ops.model internally)
            metadata = build_model(data)

            # Configure analysis
            ops.system("BandSPD")
            ops.numberer("RCM")
            ops.constraints("Transformation")

            geom_nl = data.get("geometricNonlinear", False)

            if geom_nl:
                # P-Delta: use load stepping for convergence
                ops.test("NormDispIncr", 1e-8, 50)
                ops.algorithm("Newton")
                ops.integrator("LoadControl", 0.1)
                ops.analysis("Static")
                result_code = ops.analyze(10)
            else:
                # Linear static analysis
                ops.algorithm("Linear")
                ops.integrator("LoadControl", 1.0)
                ops.analysis("Static")
                result_code = ops.analyze(1)

            if result_code != 0:
                return SolveResponse(
                    success=False,
                    error=f"Analysis did not converge (code {result_code})",
                )

            # Calculate reactions
            ops.reactions()

            # Extract results
            result = extract_results(data, metadata)
            return SolveResponse(**result)

        except Exception as e:
            traceback.print_exc()
            return SolveResponse(success=False, error=str(e))


# -- AI Chat endpoint (Claude CLI virtual terminal) --------------------------

def _build_prompt(message: str, model_state: Optional[Dict[str, Any]],
                  history: Optional[List[Dict[str, Any]]]) -> str:
    """Build the full prompt for the claude CLI, including model state and history."""
    parts = []

    # System instructions
    parts.append(SYSTEM_PROMPT)
    parts.append("\n---\n")

    # Model state
    if model_state:
        parts.append("## CURRENT MODEL STATE")
        parts.append(f"Nodes: {model_state.get('node_count', 0)}")
        parts.append(f"Beams: {model_state.get('beam_count', 0)}")
        parts.append(f"Plates: {model_state.get('plate_count', 0)}")
        parts.append(f"Supports: {model_state.get('support_count', 0)}")
        parts.append(f"Load cases: {model_state.get('load_case_count', 0)}")
        parts.append(f"Solved: {model_state.get('is_solved', False)}")
        parts.append(f"Analysis type: {model_state.get('analysis_type', 'frame')}")

        if model_state.get("nodes"):
            parts.append(f"\nNode details: {json.dumps(model_state['nodes'][:50])}")
        if model_state.get("beams"):
            parts.append(f"\nBeam details: {json.dumps(model_state['beams'][:50])}")
        if model_state.get("load_cases"):
            parts.append(f"\nLoad cases: {json.dumps(model_state['load_cases'][:10])}")

        parts.append("")

    # Conversation history
    if history:
        parts.append("## CONVERSATION HISTORY")
        for entry in history[-10:]:  # Keep last 10 turns to stay within context
            role = entry.get("role", "user")
            content = entry.get("content", "")
            if role == "user":
                parts.append(f"User: {content}")
            elif role == "assistant":
                parts.append(f"Assistant: {content}")
        parts.append("")

    # Current user message
    parts.append(f"## USER MESSAGE\n{message}")

    return "\n".join(parts)


def _parse_response(raw: str) -> Dict[str, Any]:
    """Parse Claude CLI response to extract text and commands."""
    commands = []
    text_parts = []

    # Look for <!--COMMANDS--> markers with JSON blocks
    # Pattern: <!--COMMANDS--> followed by ```json ... ```
    command_pattern = r'<!--COMMANDS-->\s*```json\s*\n?(.*?)```'
    matches = re.findall(command_pattern, raw, re.DOTALL)

    for match in matches:
        try:
            parsed = json.loads(match.strip())
            if isinstance(parsed, list):
                for item in parsed:
                    if isinstance(item, dict) and "cmd" in item:
                        commands.append({
                            "tool": item["cmd"],
                            "args": item.get("args", {}),
                        })
        except json.JSONDecodeError:
            pass

    # Also try to find JSON arrays without the marker (fallback)
    if not commands:
        json_pattern = r'```json\s*\n?(\[.*?\])```'
        matches = re.findall(json_pattern, raw, re.DOTALL)
        for match in matches:
            try:
                parsed = json.loads(match.strip())
                if isinstance(parsed, list):
                    for item in parsed:
                        if isinstance(item, dict) and "cmd" in item:
                            commands.append({
                                "tool": item["cmd"],
                                "args": item.get("args", {}),
                            })
            except json.JSONDecodeError:
                pass

    # Extract text (everything outside the command blocks)
    clean_text = re.sub(r'<!--COMMANDS-->\s*```json\s*\n?.*?```', '', raw, flags=re.DOTALL)
    clean_text = clean_text.strip()

    # If no text after removing commands, check if there's text before/after
    if clean_text:
        text_parts.append(clean_text)

    return {
        "response": "\n".join(text_parts) if text_parts else None,
        "commands": commands if commands else None,
    }


@app.post("/api/chat", response_model=ChatResponse)
def chat(req: ChatRequest):
    """AI chat via Claude CLI virtual terminal subprocess."""
    prompt = _build_prompt(req.message, req.model_state, req.conversation_history)

    try:
        # Run claude CLI in pipe mode with text output
        result = subprocess.run(
            ["claude", "-p", "--output-format", "text"],
            input=prompt,
            capture_output=True,
            text=True,
            timeout=120,
        )

        if result.returncode != 0:
            stderr = result.stderr.strip()
            if stderr:
                return ChatResponse(error=f"Claude CLI error: {stderr}")
            return ChatResponse(error=f"Claude CLI exited with code {result.returncode}")

        raw_output = result.stdout.strip()
        if not raw_output:
            return ChatResponse(error="Claude CLI returned empty response")

        # Parse the response for text and commands
        parsed = _parse_response(raw_output)

        return ChatResponse(
            response=parsed["response"],
            commands=parsed["commands"],
        )

    except FileNotFoundError:
        return ChatResponse(
            error="Claude CLI not found. Install with: npm install -g @anthropic-ai/claude-code"
        )
    except subprocess.TimeoutExpired:
        return ChatResponse(error="Claude CLI timed out after 120 seconds")
    except Exception as e:
        traceback.print_exc()
        return ChatResponse(error=f"Chat error: {str(e)}")


# -- ERPNext proxy endpoints -------------------------------------------------

def _erpnext_headers():
    return {"Authorization": f"token {ERPNEXT_API_KEY}:{ERPNEXT_API_SECRET}"}


@app.get("/api/erpnext/projects")
def erpnext_projects(search: str = Query("", description="Search text")):
    if not ERPNEXT_URL:
        return {"data": [], "error": "ERPNext not configured"}
    try:
        params = {
            "doctype": "Project",
            "txt": search,
            "filters": '{"status":"Open"}',
            "fields": '["name","project_name","customer","status","company"]',
            "limit_page_length": 20,
        }
        resp = http_requests.get(
            f"{ERPNEXT_URL}/api/resource/Project",
            params=params,
            headers=_erpnext_headers(),
            timeout=10,
        )
        resp.raise_for_status()
        return {"data": resp.json().get("data", []), "error": None}
    except Exception as e:
        return {"data": [], "error": str(e)}


@app.get("/api/erpnext/project/{name}")
def erpnext_project_detail(name: str):
    if not ERPNEXT_URL:
        return {"data": None, "error": "ERPNext not configured"}
    try:
        resp = http_requests.get(
            f"{ERPNEXT_URL}/api/resource/Project/{name}",
            headers=_erpnext_headers(),
            timeout=10,
        )
        resp.raise_for_status()
        return {"data": resp.json().get("data"), "error": None}
    except Exception as e:
        return {"data": None, "error": str(e)}
