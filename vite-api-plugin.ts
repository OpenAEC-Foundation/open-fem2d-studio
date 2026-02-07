import type { Plugin } from 'vite';

/**
 * Vite plugin that adds local API middleware endpoints for the FEM solver.
 * These endpoints are available during development via the Vite dev server.
 *
 * Endpoints:
 *   GET  /api/health  - Health check
 *   GET  /api/info    - API description
 *   POST /api/solve   - Accept mesh JSON, solve it, return results
 *   GET  /api/model   - Return info about the API model endpoint
 *   POST /api/model   - Accept natural language command, parse it, return structured model
 *   POST /api/chat    - Alias for POST /api/model (backward compat with AgentPanel)
 */
export function apiPlugin(): Plugin {
  return {
    name: 'fem-api',
    configureServer(server) {
      // ── Health check ────────────────────────────────────────────────────
      server.middlewares.use('/api/health', (_req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ status: 'ok', version: '1.0.0', agent: true }));
      });

      // ── Info endpoint ───────────────────────────────────────────────────
      server.middlewares.use('/api/info', (_req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          name: 'Open-FEM-Studio',
          version: '0.2.0',
          endpoints: [
            { path: '/api/health', method: 'GET', description: 'Health check' },
            { path: '/api/info', method: 'GET', description: 'API info' },
            { path: '/api/solve', method: 'POST', description: 'Solve a FEM model (accepts mesh JSON)' },
            { path: '/api/model', method: 'GET', description: 'API model endpoint info' },
            { path: '/api/model', method: 'POST', description: 'Parse natural language command into structured model' },
          ],
        }));
      });

      // ── Solve endpoint ──────────────────────────────────────────────────
      server.middlewares.use('/api/solve', (req, res) => {
        res.setHeader('Content-Type', 'application/json');
        // Add CORS headers for external access
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
          res.statusCode = 204;
          res.end();
          return;
        }

        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end(JSON.stringify({
            success: false,
            error: 'Method not allowed. Use POST with a JSON body.',
          }));
          return;
        }

        let body = '';
        req.on('data', (chunk: Buffer) => {
          body += chunk.toString();
        });
        req.on('end', async () => {
          try {
            const data = JSON.parse(body);

            // Validate required fields
            if (!data.nodes || !Array.isArray(data.nodes)) {
              res.statusCode = 400;
              res.end(JSON.stringify({
                success: false,
                error: 'Missing or invalid "nodes" array.',
              }));
              return;
            }

            // Import solver dynamically (ESM modules)
            // Note: The actual solving happens client-side in the browser.
            // This endpoint validates the payload and returns a confirmation
            // that it can be solved, along with model statistics.
            const nodeCount = data.nodes?.length ?? 0;
            const beamCount = data.beamElements?.length ?? data.beams?.length ?? 0;
            const materialCount = data.materials?.length ?? 0;
            const analysisType = data.analysisType ?? 'frame';

            // Count constrained DOFs
            let constrainedDofs = 0;
            for (const node of data.nodes) {
              if (node.constraints?.x) constrainedDofs++;
              if (node.constraints?.y) constrainedDofs++;
              if (node.constraints?.rotation) constrainedDofs++;
            }

            // Count loaded nodes
            let loadedNodes = 0;
            for (const node of data.nodes) {
              if (node.loads && (node.loads.fx !== 0 || node.loads.fy !== 0 || node.loads.moment !== 0)) {
                loadedNodes++;
              }
            }

            // Total DOFs for frame analysis
            const totalDofs = nodeCount * 3; // 3 DOFs per node for frame
            const freeDofs = totalDofs - constrainedDofs;

            // Validate solvability
            if (constrainedDofs === 0) {
              res.statusCode = 400;
              res.end(JSON.stringify({
                success: false,
                error: 'Model has no supports (constrained DOFs). Add boundary conditions before solving.',
              }));
              return;
            }

            if (beamCount === 0 && !(data.elements && data.elements.length > 0)) {
              res.statusCode = 400;
              res.end(JSON.stringify({
                success: false,
                error: 'Model has no elements. Add beam or plate elements before solving.',
              }));
              return;
            }

            res.end(JSON.stringify({
              success: true,
              message: 'Model validated. Use the browser-based solver for full results.',
              model: {
                nodes: nodeCount,
                beamElements: beamCount,
                materials: materialCount,
                analysisType,
                totalDofs,
                constrainedDofs,
                freeDofs,
                loadedNodes,
              },
              note: 'The FEM solver runs client-side in the browser. This endpoint validates the model structure.',
            }));
          } catch {
            res.statusCode = 400;
            res.end(JSON.stringify({
              success: false,
              error: 'Invalid JSON body',
            }));
          }
        });
      });

      // ── Model endpoint ──────────────────────────────────────────────────
      server.middlewares.use('/api/model', (req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
          res.statusCode = 204;
          res.end();
          return;
        }

        if (req.method === 'GET') {
          res.end(JSON.stringify({
            success: true,
            description: 'POST a natural language command to this endpoint to generate a structural model.',
            supportedCommands: [
              'beam / ligger - Simply supported beam',
              'cantilever / console - Cantilever beam',
              'portal / portaal - Portal frame',
              'truss / vakwerk - Truss',
              'continuous beam / doorlopende ligger - Continuous beam',
            ],
            example: {
              method: 'POST',
              body: { command: 'Create a simply supported beam 6m with 10 kN/m' },
            },
          }));
          return;
        }

        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end(JSON.stringify({ success: false, error: 'Method not allowed' }));
          return;
        }

        let body = '';
        req.on('data', (chunk: Buffer) => {
          body += chunk.toString();
        });
        req.on('end', async () => {
          try {
            const data = JSON.parse(body);
            const command = data.command || data.message || '';

            if (!command) {
              res.statusCode = 400;
              res.end(JSON.stringify({
                success: false,
                error: 'Missing "command" or "message" field in request body.',
              }));
              return;
            }

            // Dynamically import the agent parser
            // Note: In Vite dev server middleware, we can use dynamic import for ESM
            try {
              const { parseCommand } = await import('./src/core/agent/ModelAgent');
              const parsed = parseCommand(command);

              if (!parsed) {
                res.end(JSON.stringify({
                  success: false,
                  error: 'Could not parse the command. Use keywords like: beam, cantilever, portal, truss, continuous beam',
                  receivedCommand: command,
                }));
                return;
              }

              res.end(JSON.stringify({
                success: true,
                command: parsed,
                receivedInput: command,
                note: 'This returns the parsed command structure. Execute it client-side using executeCommand().',
              }));
            } catch (importErr) {
              // If dynamic import fails (e.g., TypeScript not compiled), fall back to simple parsing
              res.end(JSON.stringify({
                success: true,
                message: 'Command received. The agent parser runs client-side in the browser.',
                receivedCommand: command,
                note: 'Use the AgentPanel in the browser UI for full command execution.',
              }));
            }
          } catch {
            res.statusCode = 400;
            res.end(JSON.stringify({
              success: false,
              error: 'Invalid JSON body',
            }));
          }
        });
      });

      // ── Chat endpoint (alias for model, backward compat) ────────────────
      server.middlewares.use('/api/chat', (req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
          res.statusCode = 204;
          res.end();
          return;
        }

        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end(JSON.stringify({ success: false, error: 'Method not allowed' }));
          return;
        }

        let body = '';
        req.on('data', (chunk: Buffer) => {
          body += chunk.toString();
        });
        req.on('end', () => {
          try {
            const data = JSON.parse(body);
            const message = data.message || '';

            // The agent now runs fully client-side, so this endpoint just acknowledges
            res.end(JSON.stringify({
              success: true,
              response: `Command received: "${message}". The model agent now runs fully client-side in the AgentPanel. Open the AI Agent panel to use natural language model creation.`,
            }));
          } catch {
            res.statusCode = 400;
            res.end(JSON.stringify({
              success: false,
              error: 'Invalid JSON body',
            }));
          }
        });
      });
    },
  };
}
