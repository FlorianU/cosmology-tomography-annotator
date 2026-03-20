# Cosmological 2D Tomography Annotator

A lightweight, web-based tool for manual segmentation of 3D cosmological FITS data (Clusters, Filaments, Voids) using 2D cross-sections. Built for comparative user studies against VR environments.

**Related Research:** [Insert Link to Master Thesis / Published Study Here]

## Feature Overview

- **Dual-Axis Tomography:** Paint in the primary Z-axis (XY plane) and cross-reference structures in the Y-axis (XZ plane).
- **Contextual Spatial Jump:** Press `Spacebar` while pointing at a structure to instantly slice the cube at that exact spatial coordinate in the opposing axis.
- **Onion Skinning (Shine-Through):** Configurable depth-blending allows underlying slices and annotations to shine through, revealing 3D continuity.
- **Dynamic Orthogonal Projection:** Annotations drawn on the Z-axis are dynamically reconstructed and projected as 3D block-contours when viewing the Y-axis.
- **3D Minimap:** Floating isometric wireframe tracks your exact spatial plane within the dataset in real-time.
- **Blob-Based JSON Export:** Bypasses browser memory limits to package metadata (Time on task, Participant ID) and base64 drawing data into a unified JSON file.

## Quick Start Guide

### 1. Data Preparation (Python Slicer)

The web app requires pre-rendered 2D PNGs. Use the provided Python slicing script (`slicer.py`) to extract these from your `.fits` cube.

1. Place your data cube in the script directory and update `fits_filename` in the script.
2. Set `slices_to_fuse_z` to compress depth (e.g., 6 slices into 1 image).
3. Run the script. It will generate two folders: `slices_Z/` and `slices_Y/`.

### 2. Web Application Setup

1. Move the generated `slices_Z/` and `slices_Y/` folders into the same directory as `index.html`, `styles.css`, and `script.js`.
2. Launch a local web server (e.g., `python -m http.server`) to bypass browser CORS restrictions for local images.
3. Open `http://localhost:8000` in your web browser.

### 3. Annotation Workflow

1. **Configure:** Enter the Participant ID, exact slice count (outputted by the python script), and desired shine-through depth.
2. **Start:** Click `START TASK` to lock configurations and begin the background timer.
3. **Draw (Z-Axis):** Use the mouse to paint or erase structures. Use `Scroll Wheel` to zoom and `Middle-Click` to pan.
4. **Reference (Y-Axis):** Press `Spacebar` over a structure to jump to its side-profile to check if it is a sphere or a tube. (Drawing is locked in this view). Press `Spacebar` again to return.
5. **Toggle Visibility:** Use the `HIDE ANNOTATIONS` button to view the raw data without your strokes obstructing the view.

### 4. Export

Click `FINISH & EXPORT`. The timer will stop, and a JSON file containing all metadata and spatial masks will automatically download.

---

## Contact

For questions regarding this prototype, the VR comparison data, or the cosmological dataset, please contact:

- **Researcher:** Florian Unger
- **Email:** florian.a.unger@gmail.com
- **Institution:** Stockholm University
