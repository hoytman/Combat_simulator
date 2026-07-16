# Ranged Combat Simulator

A browser-based turn-by-turn ranged combat simulator on a 1000x1000 canvas. Create custom unit types, place them on the battlefield for two competing sides (Blue and Red), and run simulations to see which army wins.

## Features

- **Custom Unit Types** — Define units with configurable health, range, power, attacks, accuracy, dodge, armor, speed, symbol, and targeting tactic (closest or most damaged).
- **Battlefield Placement** — Click to place units on a canvas grid for Blue (Comp 1) or Red (Comp 2). Select, move, flip, and center units with toolbar controls.
- **Bulk Import** — Paste coordinate lists to quickly import formations for either side.
- **Turn-Based Simulation** — Run battles with adjustable turn delay speed. Units attack based on range and targeting tactics each turn until one side is eliminated.
- **Batch Runs** — Run multiple simulations in batch to compare outcomes statistically.
- **Batch Definitions** — Define and save batch configurations with varying unit counts to explore different army compositions.
- **Graph View** — Visualize batch results as a heatmap showing win rates and health totals across configurations.
- **CSV Logging** — Export battle results as CSV for external analysis.
- **Image Export** — Download the current battlefield as an image.
- **Persistent State** — Unit types, placements, and batch definitions auto-save to browser local storage.

## Running with Docker

Build and run the container:

```bash
docker build -t com_sim .
docker run -d --name com_sim -p 80:80 com_sim
```

Then open [http://localhost](http://localhost) in your browser.

To stop and remove the container:

```bash
docker stop com_sim
docker rm com_sim
```

## Running without Docker

Serve the files with any static web server. For example:

```bash
python3 -m http.server 8000
```

Then open [http://localhost:8000](http://localhost:8000).

> **Note:** Opening `index.html` directly as a file will not work because the app uses ES module scripts, which require HTTP serving.

## Quick Start

1. Go to the **Types** tab and click **+ Create Type** to define a unit type (e.g., Archer, Knight).
2. Select a type from the toolbar dropdown and a side (Blue 1 or Red 2).
3. Click on the canvas to place units.
4. Click **Play Batch** to run simulations and name the batch.
5. Switch to the **Graph** tab to visualize results, or the **Log** tab to view/download CSV data.

## Files

- `index.html` — Application markup
- `app.js` — All application logic
- `styles.css` — Styling
- `Dockerfile` — Nginx container for serving the app
