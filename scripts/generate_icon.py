"""
Generate professional icon for Open FEM2D Studio.
Creates a structural engineering themed icon with triangular mesh pattern.
"""
from PIL import Image, ImageDraw, ImageFont
import math
import os

def create_icon(size=512):
    """Create a professional FEM analysis icon."""
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Colors
    bg_dark = (25, 42, 86)        # Deep navy
    bg_mid = (36, 60, 120)        # Medium navy
    accent = (0, 164, 255)        # Bright blue
    accent_light = (80, 200, 255) # Light blue
    white = (255, 255, 255)
    node_color = (255, 200, 50)   # Gold/yellow for nodes
    mesh_color = (0, 180, 255, 200)  # Cyan mesh lines

    margin = size * 0.02

    # Draw rounded rectangle background
    corner_r = size // 8
    draw.rounded_rectangle(
        [margin, margin, size - margin, size - margin],
        radius=corner_r,
        fill=bg_dark
    )

    # Inner gradient effect - lighter center
    inner_margin = size * 0.08
    draw.rounded_rectangle(
        [inner_margin, inner_margin, size - inner_margin, size - inner_margin],
        radius=corner_r - 8,
        fill=bg_mid
    )

    # Draw a triangular mesh structure (the core FEM symbol)
    cx, cy = size * 0.5, size * 0.48
    mesh_size = size * 0.32

    # Create triangular mesh nodes - structured grid
    nodes = []
    rows = 5
    for row in range(rows):
        cols_in_row = row + 1
        y = cy - mesh_size * 0.5 + (row / (rows - 1)) * mesh_size
        row_width = (cols_in_row - 1) * (mesh_size / (rows - 1))
        start_x = cx - row_width / 2
        for col in range(cols_in_row):
            if cols_in_row > 1:
                x = start_x + col * (mesh_size / (rows - 1))
            else:
                x = cx
            nodes.append((x, y))

    # Define mesh edges (triangulation)
    edges = []
    idx = 0
    for row in range(rows - 1):
        cols_current = row + 1
        cols_next = row + 2
        start_current = idx
        start_next = idx + cols_current

        for col in range(cols_current):
            # Connect to node below-left and below-right
            edges.append((start_current + col, start_next + col))
            edges.append((start_current + col, start_next + col + 1))

        # Connect horizontal edges in next row
        for col in range(cols_next - 1):
            edges.append((start_next + col, start_next + col + 1))

        idx += cols_current

    # Draw mesh edges with glow effect
    for n1, n2 in edges:
        x1, y1 = nodes[n1]
        x2, y2 = nodes[n2]
        # Glow
        draw.line([(x1, y1), (x2, y2)], fill=(0, 120, 200, 60), width=max(4, size // 80))
        # Main line
        draw.line([(x1, y1), (x2, y2)], fill=mesh_color, width=max(2, size // 170))

    # Draw stress gradient on some triangles (filled)
    # Color some triangles to show stress visualization
    stress_colors = [
        (0, 100, 255, 40),   # Low stress - blue
        (0, 200, 150, 50),   # Medium - cyan
        (255, 200, 0, 45),   # Higher - yellow
        (255, 80, 50, 50),   # High stress - red-orange
    ]

    # Fill select triangles with stress colors
    tri_idx = 0
    idx = 0
    for row in range(rows - 1):
        cols_current = row + 1
        start_current = idx
        start_next = idx + cols_current

        for col in range(cols_current):
            # Upper triangle
            color_idx = min(tri_idx % len(stress_colors), len(stress_colors) - 1)
            tri = [
                nodes[start_current + col],
                nodes[start_next + col],
                nodes[start_next + col + 1]
            ]
            draw.polygon(tri, fill=stress_colors[color_idx])
            tri_idx += 1

            # Lower triangle (between current nodes)
            if col < cols_current - 1:
                color_idx = min(tri_idx % len(stress_colors), len(stress_colors) - 1)
                tri = [
                    nodes[start_current + col],
                    nodes[start_current + col + 1],
                    nodes[start_next + col + 1]
                ]
                draw.polygon(tri, fill=stress_colors[color_idx])
                tri_idx += 1

        idx += cols_current

    # Redraw edges on top of filled triangles
    for n1, n2 in edges:
        x1, y1 = nodes[n1]
        x2, y2 = nodes[n2]
        draw.line([(x1, y1), (x2, y2)], fill=accent, width=max(2, size // 200))

    # Draw nodes as bright dots
    node_r = max(4, size // 64)
    for i, (x, y) in enumerate(nodes):
        # Outer glow
        draw.ellipse(
            [x - node_r * 1.8, y - node_r * 1.8, x + node_r * 1.8, y + node_r * 1.8],
            fill=(255, 200, 50, 60)
        )
        # Node
        draw.ellipse(
            [x - node_r, y - node_r, x + node_r, y + node_r],
            fill=node_color
        )
        # Highlight
        hr = node_r * 0.5
        draw.ellipse(
            [x - hr, y - hr - node_r * 0.2, x + hr, y + hr - node_r * 0.2],
            fill=(255, 255, 200)
        )

    # Draw support symbols at bottom nodes (triangular supports)
    bottom_start = sum(range(1, rows + 1)) - rows  # Index of first bottom row node
    support_size = size * 0.025
    for i in [bottom_start, bottom_start + rows - 1]:  # Left and right bottom
        nx, ny = nodes[i]
        # Triangle support symbol
        pts = [
            (nx, ny + node_r + 2),
            (nx - support_size, ny + node_r + support_size * 1.8),
            (nx + support_size, ny + node_r + support_size * 1.8),
        ]
        draw.polygon(pts, fill=accent_light)
        # Ground line
        draw.line(
            [(nx - support_size * 1.3, ny + node_r + support_size * 1.8),
             (nx + support_size * 1.3, ny + node_r + support_size * 1.8)],
            fill=accent_light, width=max(2, size // 256)
        )

    # Draw load arrow at top node
    top_x, top_y = nodes[0]
    arrow_len = size * 0.08
    arrow_w = size * 0.02
    # Arrow shaft
    draw.line(
        [(top_x, top_y - arrow_len - node_r), (top_x, top_y - node_r - 2)],
        fill=(255, 80, 80), width=max(3, size // 128)
    )
    # Arrowhead
    draw.polygon([
        (top_x, top_y - node_r - 1),
        (top_x - arrow_w, top_y - node_r - arrow_w * 1.5),
        (top_x + arrow_w, top_y - node_r - arrow_w * 1.5),
    ], fill=(255, 80, 80))

    # Text label at bottom: "FEM"
    text_y = size * 0.78
    try:
        font_size = size // 6
        font = ImageFont.truetype("arial.ttf", font_size)
    except:
        try:
            font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", font_size)
        except:
            font = ImageFont.load_default()

    text = "FEM"
    bbox = draw.textbbox((0, 0), text, font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    tx = (size - tw) / 2
    ty = text_y

    # Text shadow
    draw.text((tx + 2, ty + 2), text, fill=(0, 0, 0, 120), font=font)
    # Main text
    draw.text((tx, ty), text, fill=white, font=font)

    # Subtle "2D" subscript
    try:
        small_font_size = size // 12
        small_font = ImageFont.truetype("arial.ttf", small_font_size)
    except:
        small_font = font

    sub_text = "2D"
    sub_bbox = draw.textbbox((0, 0), sub_text, font=small_font)
    sub_tw = sub_bbox[2] - sub_bbox[0]
    draw.text((tx + tw + 4, ty + th - small_font_size * 0.9), sub_text, fill=accent_light, font=small_font)

    return img


def main():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    build_dir = os.path.join(base_dir, 'build')
    public_dir = os.path.join(base_dir, 'public')

    os.makedirs(build_dir, exist_ok=True)

    # Generate high-res base icon
    icon_512 = create_icon(512)

    # Save PNG versions
    icon_512.save(os.path.join(build_dir, 'icon.png'), 'PNG')
    print(f"Created build/icon.png (512x512)")

    icon_256 = icon_512.resize((256, 256), Image.LANCZOS)
    icon_256.save(os.path.join(build_dir, 'icon-256.png'), 'PNG')
    print(f"Created build/icon-256.png")

    # Create ICO with multiple sizes for Windows (256 first for electron-builder)
    ico_sizes = [256, 128, 64, 48, 32, 24, 16]
    ico_images = []
    for s in ico_sizes:
        resized = icon_512.resize((s, s), Image.LANCZOS)
        ico_images.append(resized)

    ico_path = os.path.join(build_dir, 'icon.ico')
    # Save with 256x256 as the primary image
    ico_images[0].save(
        ico_path,
        format='ICO',
        sizes=[(s, s) for s in ico_sizes],
        append_images=ico_images[1:]
    )
    print(f"Created build/icon.ico (multi-size: {ico_sizes})")

    # Also save as favicon.ico in public
    favicon_path = os.path.join(public_dir, 'favicon.ico')
    icon_48 = icon_512.resize((48, 48), Image.LANCZOS)
    icon_32 = icon_512.resize((32, 32), Image.LANCZOS)
    icon_16 = icon_512.resize((16, 16), Image.LANCZOS)
    icon_16.save(favicon_path, format='ICO', sizes=[(16, 16), (32, 32), (48, 48)],
                 append_images=[icon_32, icon_48])
    print(f"Created public/favicon.ico")

    print("\nAll icons generated successfully!")


if __name__ == '__main__':
    main()
