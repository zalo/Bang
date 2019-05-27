# Bang

<!-- Load the paper.js library and Bang.js (which creates the canvas)... -->
<script type="text/javascript" src="https://cdnjs.cloudflare.com/ajax/libs/paper.js/0.12.0/paper-core.min.js"></script>
<script type="text/javascript" src="Bang.js"></script>
<div class="ProjectControls">
    Brush Width: <input type="range" min="1" max="100" value="10" class="slider" id="brushWidth">
    <a href="#" onclick="drawingEnvironment.prevFrame();">Prev Frame</a>
    <a href="#" onclick="drawingEnvironment.nextFrame();">Next Frame</a>
    <a href="#" onclick="drawingEnvironment.duplicateFrame();">Duplicate Frame</a>
</div>
<div class="ExportControls">
    Load from SVG: <input id="svg-file" type="file" accept="image/svg+xml"/>
    <a href="#" onclick="drawingEnvironment.saveSVG();">Save to SVG</a>
</div>

## Instructions

- `Left Click`: Draw a brush stroke
- `Middle Click`: Move a brush stroke, segment, or shape
- `Right Click`: Erase a stroke, segment, or shape
- `Ctrl-Z`/`Ctrl-Y`: Undo/Redo the last action
- Brush Width: Change the width of the brush
- Prev/Next Frame: Navigate the playhead forward and backward one frame.
- Duplicate Frame: Either creates a new frame with the contents of this frame (or copies the content from the last frame)
- Load from SVG: Loads a prior session or an arbitrary foreign SVG
- Save SVG: Saves this session as an animated SVG (preserving undo)

## About

Bang is a flash-inspired tool for creating animated vector graphics.  

It attempts to recreate some of the functionality of .swf's using clever CSS embedded within the .svg.

## Credits

Bang is based on the amazing [`paper.js`](http://paperjs.org/) by [@lehni](https://github.com/lehni) and [@puckey](https://github.com/puckey).