var DrawingEnvironment = function () {
  this.isResizable = document.currentScript.getAttribute("resizable");              // Wraps the canvas in resizing handles
  this.width = document.currentScript.getAttribute("width");                        // Starting Width
  this.forceMobile = document.currentScript.getAttribute("forceMobile") == "true";  // Whether to force the mobile buttons to appear
  this.movePath = true;                                                             // Whether to move paths or add segments with middle click
  this.brushWidth = 5;                                                              // The width of the brush
  this.skinningWidth = 3;                                                           // The number of onion-skinning frames visible in each direction
  this.frameRate = 10;                                                              // The current framerate to export to the .svg
  this.removeCmd = 'Remove-';                                                       // Prefix on remove "do" commands
  this.forcedButton = -1;                                                           // Used for forcing brush/move/eraser on mobile
  this.reader = new FileReader();                                                   // File Reader for loading .svg sessions

  // Setup the Canvas, Project, Tools, and Callbacks
  this.init = function () {
    // Only execute our setup code once the DOM is ready
    window.onload = function () {
      // Setup a Base paper.js Project
      drawingEnvironment.canvas = document.getElementById("DrawingEnvironmentCanvas");
      paper.setup("DrawingEnvironmentCanvas");

      // Set up a Base Bang Project
      paper.project.activeLayer.name = "Frame-0";
      paper.project.activeLayer.addChildren(
        new paper.Group({ name:'Drawing' }), 
        new paper.Group({ name:'Undo', visible: false }),
        new paper.Group({ name:'Redo', visible: false }));

      // Register Animation and Resizing Callbacks
      //paper.view.onFrame  = function(event) { }
      paper.view.onResize = function(event) {
        drawingEnvironment.clearPreview(); 
      }

      // Initialize the Brush/Manipulator/Eraser Tool
      drawingEnvironment.initOmniTool();

      // Subscribe to the Brush Width Slider (added in this.initHTML)
      document.getElementById("brushWidth").addEventListener('change', (data) => {
        drawingEnvironment.brushWidth = data.target.value;
      });

      // Subscribe to the Framerate Box (added in this.initHTML)
      document.getElementById("Framerate").addEventListener('change', (data) => {
        drawingEnvironment.frameRate = data.target.value;
        drawingEnvironment.clearPreview();
      });

      // Allow users to upload SVGs from past sessions
      document.getElementById("svg-file").addEventListener('input', () => {
        // Load, Read, and Process the file!
        drawingEnvironment.reader.readAsText(document.getElementById("svg-file").files[0]);
        drawingEnvironment.clearPreview();
      });

      // Schedule processsing the uploaded file
      drawingEnvironment.reader.addEventListener("load", () => {
        paper.project.importSVG(drawingEnvironment.reader.result, {
          expandShapes: true,
          insert: false,
          onLoad: (item) => {
            // Detect if it's an animation
            if (item.children[0].name && item.children[0].name.includes("Frame-0")) {
              let removeFirstLater = false;
              let layerIndex = paper.project.activeLayer.index;
              if (paper.project.layers.length == 1 && paper.project.activeLayer.children[0].children.length == 0) {
                removeFirstLater = true;
              }
              console.log("Animation Loading Success! Found " + item.children.length + " frames.");
              for (let i = 0; i < item.children.length; i++) {
                item.children[i].visible = true;
                let nextIndex = paper.project.activeLayer.index + 1;
                let nextFrameLayer = new paper.Layer({
                  name: item.children[i].name,
                  children: item.children[i].children
                });
                paper.project.insertLayer(nextIndex, nextFrameLayer);
                nextFrameLayer.activate();
              }
              if (removeFirstLater) { paper.project.layers[0].remove(); }
              paper.project.layers[layerIndex].activate();
            } else {
              // Otherwise just import this as a dumb .svg
              console.log("Static SVG Loading Success! Found " + item.children.length + " groups.");
              paper.project.activeLayer.children[0].addChild(item);
            }
          },
          onError: (errMsg) => { console.error(errMsg); }
        });
        drawingEnvironment.updateOnionSkinning();
        document.getElementById("svg-file").value = null;
      });

      // Add event handlers to the corner and make this resizable
      if(drawingEnvironment.isResizable) {  drawingEnvironment.initResizability(); }
    }
  }

  // Initialize the callbacks for the mouse/touch tool
  this.initOmniTool = function () {
    //Prevent Right-Clicking from bringing up the context menu
    this.canvas.setAttribute("oncontextmenu", "return false;");

    this.omniTool = new paper.Tool();
    this.omniTool.lastTolerance = 5;
    this.omniTool.onMouseDown = function (event) {
      drawingEnvironment.clearPreview();
      this.button = drawingEnvironment.forcedButton == -1 ? 
                      event.event.button : 
                      drawingEnvironment.forcedButton;

      // A little bit of eraser leighway 
      this.minDistance = this.button == 2 ? this.lastTolerance * 2 : 0;

      if ((!this.button) || this.button <= 0) {
        // Begin creating a new brush stroke
        this.currentPath = new paper.Path();
        this.currentPath.strokeColor = 'black';
        this.currentPath.add(event.point);
        this.currentPath.strokeWidth = drawingEnvironment.brushWidth;
        this.currentPath.strokeCap = 'round';
      } else {
        this.currentSegment = this.currentPath = null;
        let hitResult = this.hitTestActiveLayer(event.point);

        // Return if we didn't hit anything
        if (!hitResult)
          return;

        // Select an element for movement
        if (this.button == 1) {
          this.currentPath = hitResult.item;
          if(this.currentPath){
            this.saveItemStateForUndo(hitResult.item);
            if (hitResult.type == 'segment') {
              this.currentSegment = hitResult.segment;
            } else if (hitResult.type == 'stroke' || hitResult.type == 'fill') {
              if (drawingEnvironment.movePath) {
                this.currentSegment = null;
              } else {
                let location = hitResult.location;
                this.currentSegment = this.currentPath.insert(location.index + 1, event.point);
                this.currentPath.smooth();
              }
            }
          }
        }

        // Delete this element
        if (this.button == 2) {
          if ( hitResult.type == 'stroke' || 
               hitResult.type == 'fill'   || 
               hitResult.segment.path.segments.length <= 2) {
            this.saveItemStateForUndo(hitResult.item);
            hitResult.item.remove();
          } else if (hitResult.type == 'segment') {
            this.saveItemStateForUndo(hitResult.item);
            hitResult.segment.remove();
          }
          return;
        }
      }
    }

    this.omniTool.onMouseMove = function (event) {
      paper.project.activeLayer.selected = false;
      let hit = this.hitTestActiveLayer(event.point);
      if (hit) {
        hit.item.selected = true;
        if (hit.item.strokeWidth) {
          this.lastTolerance = Math.max(hit.item.strokeWidth / 4.0, 5);
        }
      }
    }

    this.omniTool.onMouseDrag = function (event) {
      if ((!this.button) || this.button <= 0) {
        paper.project.activeLayer.selected = false;
        this.currentPath.add(event.point);
      } else if(this.button == 1) {
        if (this.currentSegment) {
          this.currentSegment.point = this.currentSegment.point.add(event.delta);
          //this.currentPath.smooth();
        } else if (this.currentPath) {
          this.currentPath.position = this.currentPath.position.add(event.delta);
        }
      } else if(this.button == 2) {
        let hitResult = this.hitTestActiveLayer(event.point);
        if (!hitResult) { return; }
        if ( hitResult.type == 'stroke' || 
          hitResult.type == 'fill'   || 
          hitResult.segment.path.segments.length <= 2) {
          this.saveItemStateForUndo(hitResult.item);
          hitResult.item.remove();
        } else if (hitResult.type == 'segment') {
          this.saveItemStateForUndo(hitResult.item);
          hitResult.segment.remove();
        }
      }
    }

    this.omniTool.onMouseUp = function (event) {
      if ((!this.button) || this.button <= 0) {
        this.currentPath.simplify(10);
        this.currentPath.name = "Stroke-" + drawingEnvironment.stringHashCode(this.currentPath.toString());
        this.currentPath.addTo(paper.project.activeLayer.children[0]);

        // Add Undo Object to Remove Stroke Later
        paper.project.activeLayer.children[1].addChild(
          new paper.Group({ name: drawingEnvironment.removeCmd + this.currentPath.name }));
          
        // Clear the redo "history" (it's technically invalid now...)
        paper.project.activeLayer.children[2].removeChildren();
      }
    }

    // Store this item's current state in the Undo Queue
    this.omniTool.saveItemStateForUndo = function(item){
      // If an object doesn't have a name, give it one :)
      if(!item.name){
        item.name = "ForeignObject-" + drawingEnvironment.stringHashCode(item.toString());
      }
      let clone = item.clone();
      clone.name = item.name;
      paper.project.activeLayer.children[1].addChild(clone);

      // Clear the redo "history" (it's technically invalid now...)
      paper.project.activeLayer.children[2].removeChildren();
    }

    // Check if the mouse is hitting anything in this frame right now...
    this.omniTool.hitTestActiveLayer = function (point) {
      return paper.project.hitTest(point, {
        segments: true,
        stroke: true,
        fill: true,
        tolerance: this.lastTolerance,
        match: (hit) => {
          return hit.item.layer == paper.project.activeLayer;
        }
      });
    }

    // Process Keyboard Shortcuts (just Undo/Redo atm)
    this.omniTool.onKeyDown = function (event) {
      if(event.key == 'right') {
        drawingEnvironment.nextFrame();
      } else if(event.key == 'left') {
        drawingEnvironment.prevFrame();
      } else if(event.key == 'delete') {
        drawingEnvironment.deleteFrame();
      } else if (event.modifiers.control) {
        if(event.key == 'z') {
          drawingEnvironment.undo();
        } else if(event.key == 'y') {
          drawingEnvironment.redo();
        }
      }
    }
  }

  // Dequeue the last undo element, and queue its inverse into the redo queue
  this.undo = function() {
    this.processDoCommand(
      paper.project.activeLayer.children[0],
      paper.project.activeLayer.children[1],
      paper.project.activeLayer.children[2]);
  }

  // Dequeue the last redo element, and queue its inverse into the undo queue
  this.redo = function() {
    this.processDoCommand(
      paper.project.activeLayer.children[0],
      paper.project.activeLayer.children[2],
      paper.project.activeLayer.children[1]);
  }

  // Dequeue a do element, and queue its reverse into the ...reverse queue
  this.processDoCommand = function(drawingLayer, commandLayer, reverseLayer){
    drawingEnvironment.clearPreview();
    let command = commandLayer.lastChild;
    if (command) {
      // If this item's name starts with the removeCmd...
      if(command.name && command.name.startsWith(this.removeCmd)){
        // Find this item and "delete" it...
        let condemnedName = command.name.substring(
          this.removeCmd.length);
        let condemnedStroke = drawingLayer.getItem({
          match: (item)=>{ return item.name == condemnedName; }
        });
        reverseLayer.addChild(condemnedStroke);
        command.remove();
      } else {
        // Check and see if this item already exists
        let strokeToReplace = drawingLayer.getItem({
          match: (item)=>{ return item.name == command.name; }
        });
        if (strokeToReplace) {
          // If it *does* exist, just replace it
          let clone = strokeToReplace.clone();
          clone.name = strokeToReplace.name;
          reverseLayer.addChild(clone);

          // Use 'replaceWith' to preserve layer order!
          strokeToReplace.replaceWith(command);
        } else {
          // If it does not exist, create it
          drawingLayer.addChild(command);
          reverseLayer.addChild(new paper.Group({ 
              name: this.removeCmd+command.name 
          }));
        }
      }
    }
  }

  // Generates CSS such that only one frame shows at a time
  // This is the "magic" that animates the SVG!
  this.generateAnimationCSS = function (frameRate = 10) {
    let frameTime = 1.0 / frameRate;
    let animationTime = frameTime * paper.project.layers.length;
    let animationString =
      '  <style type="text/css">\n' +
      '    @keyframes flash { 0%   { visibility: visible; }\n' +
      '                       ' + (100.0 / paper.project.layers.length) + '%  { visibility: hidden;  } }\n';
    for (let i = 0; i < paper.project.layers.length; i++) {
      animationString += '    #' + paper.project.layers[i].name + ' { animation: flash ' + animationTime + 's linear infinite ' + (frameTime * i) + 's;    }\n';
    }
    animationString += '  </style>';
    return animationString;
  }

  // Generate the Animated SVG from the current paper.js project
  this.createSVG = function(){
    // Ensure that all frames (but the first) are opaque and hidden by default
    for (let i = 0; i < paper.project.layers.length; i++) {
      paper.project.layers[i].visible = false;
      paper.project.layers[i].opacity = 1;
    }

    let svgString = paper.project.exportSVG({ asString: true });
    svgString = svgString.substring(0, svgString.length - 6) +
      this.generateAnimationCSS(this.frameRate) +
      svgString.substring(svgString.length - 6);
    this.updateOnionSkinning(false);
    return svgString;
  }

  // Trigger a download of the Generated SVG
  this.saveSVG = function () {
    let link = document.createElement("a");
    link.download = "drawingExport.svg";
    link.href = "data:image/svg+xml;utf8," + 
                  encodeURIComponent(this.createSVG());
    link.click();
  }

  // Adds the Generated SVG to the page for viewing
  this.previewSVG = function() {
    let SVGPreview = document.getElementById('SVG Preview');
    let SVGText = document.getElementById('SVG Text');
    if(SVGPreview.innerHTML) {
      SVGPreview.innerHTML = '';
      SVGText.innerHTML = '';
    } else {
      SVGPreview.innerHTML = '<h2>Preview: </h2><img src="'+
        "data:image/svg+xml;utf8,"+encodeURIComponent(this.createSVG())+'">';
      // Also add the text box for copying on iPads...
      if (this.isMobile) {
        SVGText.innerHTML = '<input id="SVG Box" type="text"><br>';
        setTimeout(function() {
          document.getElementById('SVG Box').value = drawingEnvironment.createSVG();
        }, 500);
      }
    }
  }

  // Destroy the current SVG Preview (and Text Box)
  this.clearPreview = function(){
    document.getElementById('SVG Preview').innerHTML = '';
    document.getElementById('SVG Text').innerHTML = '';
  }

  // Create a new frame if one doesn't exist
  this.nextFrame = function () {
    paper.project.activeLayer.selected = false;
    let nextIndex = paper.project.activeLayer.index + 1;
    if (paper.project.layers.length == nextIndex) {
      let nextFrameLayer = new paper.Layer();
      paper.project.insertLayer(nextIndex, nextFrameLayer);
      nextFrameLayer.activate();
      nextFrameLayer.addChildren(
        new paper.Group({ name:'Drawing' }), 
        new paper.Group({ name:'Undo', visible: false }),
        new paper.Group({ name:'Redo', visible: false }));
    } else {
      paper.project.layers[nextIndex].activate();
    }
    this.updateOnionSkinning();
  }

  // If there is content in this frame, create a new frame
  // If this is a new frame, copy from the previous frame
  this.duplicateFrame = function () {
    paper.project.activeLayer.selected = false;
    let currentLayer = paper.project.activeLayer;

    if (currentLayer.children[0].children.length > 0) {
      let nextFrameLayer = new paper.Layer();
      nextFrameLayer.copyContent(currentLayer);
      paper.project.insertLayer(currentLayer.index + 1, nextFrameLayer);
      nextFrameLayer.activate();
    } else {
      currentLayer.removeChildren();
      currentLayer.copyContent(paper.project.layers[Math.max(0, currentLayer.index - 1)]);
    }
    // This is deeply unsatisfying... Find a way to copy content without adding " 1" at the end...
    // Perhaps a recursive de-" 1"-ing function...
    paper.project.activeLayer.children[0].name = "Drawing";
    paper.project.activeLayer.children[1].name = "Undo";
    paper.project.activeLayer.children[2].name = "Redo";
    this.updateOnionSkinning();
  }

  // Go back one frame
  this.prevFrame = function () {
    paper.project.activeLayer.selected = false;
    paper.project.layers[Math.max(0, paper.project.activeLayer.index - 1)].activate();
    this.updateOnionSkinning();
  }

  // Delete the elements in this frame first (allows for undo's), then the frame itself (no undo)
  this.deleteFrame = function () {
    if(paper.project.activeLayer.children[0].children.length > 0){
      for(let i = paper.project.activeLayer.children[0].children.length-1; i >= 0; i--){
        let item = paper.project.activeLayer.children[0].children[i];
        this.omniTool.saveItemStateForUndo(item);
        item.remove();
      }
    } else if(paper.project.layers.length > 1) {
      paper.project.activeLayer.remove();
    }
    this.updateOnionSkinning();
  }

  // Ensure all frames are named and rendering properly
  this.updateOnionSkinning = function (clear = true) {
    if(clear) { this.clearPreview(); }
    let currentActiveIndex = paper.project.activeLayer.index;
    let minIndex = Math.max(0, currentActiveIndex - this.skinningWidth);
    let maxIndex = Math.min(paper.project.layers.length, currentActiveIndex + this.skinningWidth);
    for (let i = 0; i < paper.project.layers.length; i++) {
      paper.project.layers[i].name = "Frame-" + i;

      // Update opacity and visibility...
      if (i == currentActiveIndex) {
        paper.project.layers[i].visible = true;
        paper.project.layers[i].opacity = 1;
      } else if (i >= minIndex && i <= maxIndex) {
        paper.project.layers[i].visible = true;
        paper.project.layers[i].opacity = 
          (1.0 - ((Math.abs(i - currentActiveIndex)) / (this.skinningWidth + 1))) * 0.25;
      } else {
        paper.project.layers[i].visible = false;
        paper.project.layers[i].opacity = 0;
      }
    }
  }

  // Add event handlers to the corner and make this div/canvas resizable
  this.initResizability = function(){
    this.resizable = document.querySelector('.resizable');
    this.resizer   = document.querySelector('.resizer'  );

    drawingEnvironment.startWidth = parseInt(document.defaultView.getComputedStyle( drawingEnvironment.resizable ).width,  10);
    drawingEnvironment.startHeight = Math.min(512, drawingEnvironment.startWidth);
    drawingEnvironment.resizable.style.height = drawingEnvironment.startHeight + 'px';
    paper.view.viewSize.set(drawingEnvironment.startWidth, drawingEnvironment.startHeight);
    
    this.initResize = function(e) {
      if(e.changedTouches && e.changedTouches.length > 0){
        e.pageX = e.changedTouches[0].pageX;
        e.pageY = e.changedTouches[0].pageY;
      }
      drawingEnvironment.startX = e.pageX; drawingEnvironment.startY = e.pageY;
      drawingEnvironment.startWidth  = parseInt(document.defaultView.getComputedStyle( drawingEnvironment.resizable ).width,  10);
      drawingEnvironment.startHeight = parseInt(document.defaultView.getComputedStyle( drawingEnvironment.resizable ).height, 10);
      document.documentElement.addEventListener('mousemove', drawingEnvironment.doResize, false);
      document.documentElement.addEventListener('touchmove', drawingEnvironment.doResize, false);
      document.documentElement.addEventListener('mouseup', drawingEnvironment.stopResize, false);
      document.documentElement.addEventListener('touchend', drawingEnvironment.stopResize, false);
      document.documentElement.addEventListener('touchcancel', drawingEnvironment.stopResize, false);
      e.preventDefault();
    }
    this.doResize = function(e) {
      if(e.changedTouches && e.changedTouches.length > 0){
        e.pageX = e.changedTouches[0].pageX;
        e.pageY = e.changedTouches[0].pageY;
      }
      let width  = (drawingEnvironment.startWidth  + e.pageX - drawingEnvironment.startX);
      let height = (drawingEnvironment.startHeight + e.pageY - drawingEnvironment.startY);
      drawingEnvironment.resizable.style.width  = width  + 'px';
      drawingEnvironment.resizable.style.height = height + 'px';
      paper.view.viewSize.set(width, height);
      e.preventDefault();
    }
    this.stopResize = function(e) {
      document.documentElement.removeEventListener('mousemove', drawingEnvironment.doResize, false);   
      document.documentElement.removeEventListener('touchmove', drawingEnvironment.doResize, false);   
      document.documentElement.removeEventListener('mouseup', drawingEnvironment.stopResize, false);  
      document.documentElement.removeEventListener('touchend', drawingEnvironment.stopResize, false);
      document.documentElement.removeEventListener('touchcancel', drawingEnvironment.stopResize, false);
      e.preventDefault();
    }
    this.resizer.addEventListener( 'mousedown',  drawingEnvironment.initResize, false );
    this.resizer.addEventListener( 'touchstart', drawingEnvironment.initResize, false );
  }


  // Add DOM Elements to the Document for user interaction
  this.initHTML = function() {
    // Massive Mobile Device Detection String; how many years will this work for?
    // https://stackoverflow.com/a/3540295/11187355
    this.isMobile = false;
    if(this.forceMobile || /(android|bb\d+|meego).+mobile|avantgo|bada\/|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od)|ipad|iris|kindle|Android|Silk|lge |maemo|midp|mmp|netfront|opera m(ob|in)i|palm( os)?|phone|p(ixi|re)\/|plucker|pocket|psp|series(4|6)0|symbian|treo|up\.(browser|link)|vodafone|wap|windows (ce|phone)|xda|xiino/i.test(navigator.userAgent) 
        || /1207|6310|6590|3gso|4thp|50[1-6]i|770s|802s|a wa|abac|ac(er|oo|s\-)|ai(ko|rn)|al(av|ca|co)|amoi|an(ex|ny|yw)|aptu|ar(ch|go)|as(te|us)|attw|au(di|\-m|r |s )|avan|be(ck|ll|nq)|bi(lb|rd)|bl(ac|az)|br(e|v)w|bumb|bw\-(n|u)|c55\/|capi|ccwa|cdm\-|cell|chtm|cldc|cmd\-|co(mp|nd)|craw|da(it|ll|ng)|dbte|dc\-s|devi|dica|dmob|do(c|p)o|ds(12|\-d)|el(49|ai)|em(l2|ul)|er(ic|k0)|esl8|ez([4-7]0|os|wa|ze)|fetc|fly(\-|_)|g1 u|g560|gene|gf\-5|g\-mo|go(\.w|od)|gr(ad|un)|haie|hcit|hd\-(m|p|t)|hei\-|hi(pt|ta)|hp( i|ip)|hs\-c|ht(c(\-| |_|a|g|p|s|t)|tp)|hu(aw|tc)|i\-(20|go|ma)|i230|iac( |\-|\/)|ibro|idea|ig01|ikom|im1k|inno|ipaq|iris|ja(t|v)a|jbro|jemu|jigs|kddi|keji|kgt( |\/)|klon|kpt |kwc\-|kyo(c|k)|le(no|xi)|lg( g|\/(k|l|u)|50|54|\-[a-w])|libw|lynx|m1\-w|m3ga|m50\/|ma(te|ui|xo)|mc(01|21|ca)|m\-cr|me(rc|ri)|mi(o8|oa|ts)|mmef|mo(01|02|bi|de|do|t(\-| |o|v)|zz)|mt(50|p1|v )|mwbp|mywa|n10[0-2]|n20[2-3]|n30(0|2)|n50(0|2|5)|n7(0(0|1)|10)|ne((c|m)\-|on|tf|wf|wg|wt)|nok(6|i)|nzph|o2im|op(ti|wv)|oran|owg1|p800|pan(a|d|t)|pdxg|pg(13|\-([1-8]|c))|phil|pire|pl(ay|uc)|pn\-2|po(ck|rt|se)|prox|psio|pt\-g|qa\-a|qc(07|12|21|32|60|\-[2-7]|i\-)|qtek|r380|r600|raks|rim9|ro(ve|zo)|s55\/|sa(ge|ma|mm|ms|ny|va)|sc(01|h\-|oo|p\-)|sdk\/|se(c(\-|0|1)|47|mc|nd|ri)|sgh\-|shar|sie(\-|m)|sk\-0|sl(45|id)|sm(al|ar|b3|it|t5)|so(ft|ny)|sp(01|h\-|v\-|v )|sy(01|mb)|t2(18|50)|t6(00|10|18)|ta(gt|lk)|tcl\-|tdg\-|tel(i|m)|tim\-|t\-mo|to(pl|sh)|ts(70|m\-|m3|m5)|tx\-9|up(\.b|g1|si)|utst|v400|v750|veri|vi(rg|te)|vk(40|5[0-3]|\-v)|vm40|voda|vulc|vx(52|53|60|61|70|80|81|83|85|98)|w3c(\-| )|webc|whit|wi(g |nc|nw)|wmlb|wonu|x700|yas\-|your|zeto|zte\-/i.test(navigator.userAgent.substr(0,4))) { 
        this.isMobile = true;
    }

    // Add buttons depending on whether this is a mobile/touchscreen device or not
    let mobileButtons = '';
    if(this.isMobile){
      mobileButtons = '\
        <div class="ProjectControls">\
        <input type="button" value="Brush" onclick="drawingEnvironment.forcedButton = 0;"> | \
        <input type="button" value="Move" onclick="drawingEnvironment.forcedButton = 1;"> | \
        <input type="button" value="Erase" onclick="drawingEnvironment.forcedButton = 2;"> |  | \
        <input type="button" value="Undo" onclick="drawingEnvironment.undo();"> | \
        <input type="button" value="Redo" onclick="drawingEnvironment.redo();"> \
        </div>';
    }

    // Add the main buttons that everyone will use
    this.width = (this.width) ? this.width  : "100%";
    this.isResizable = true;
    let resizableStart = resizableEnd = '';
    if(this.isResizable){
      resizableStart = '<div class="resizable" style="background: white; width: ' + this.width + '; position: relative;">';
      resizableEnd = '<div class="resizer" style="width: 15px; height: 15px; background: #999999; position:absolute; right: -1; bottom: -1; cursor: se-resize; user-select: none;">  </div></div>';
    }
    document.currentScript.insertAdjacentHTML('afterend', resizableStart+'\
        <canvas id="DrawingEnvironmentCanvas" hidpi="on" style="border: #9999 1px solid; width: 100%; height: 100%;"></canvas>\
      ' + resizableEnd + '\
      ' + mobileButtons + '\
      <div class="ProjectControls">\
          <b>Brush Width: </b> <input type="range" min="1" max="100" value="10" class="slider" id="brushWidth"> | \
          <input type="button" value="Prev" onclick="drawingEnvironment.prevFrame();"> | \
          <input type="button" value="Next" onclick="drawingEnvironment.nextFrame();"> | \
          <input type="button" value="Duplicate" onclick="drawingEnvironment.duplicateFrame();"> |\
          <input type="button" value="Delete" onclick="drawingEnvironment.deleteFrame();">\
      </div>\
      <div class="ExportControls">\
          Load from SVG: <input id="svg-file" type="file" accept="image/svg+xml"/> | \
          <input type="button" value="Save to SVG" onclick="drawingEnvironment.saveSVG();">\
      </div>\
      <div class="PlaybackControls">\
          <input type="button" value="Play" onclick="drawingEnvironment.previewSVG();"> | \
          Framerate: <input id="Framerate" type="number" value="10" min="0" max="240">\
      </div>\
      <div id="SVG Preview"></div><div id="SVG Text"></div><div id="Message Text"></div>');
  }

  // Hash Generation for unique undo identifiers
  this.stringHashCode = function(stringToHash) {
    let hash = 0;
    if (stringToHash.length == 0) { return hash; }
    for (let i = 0; i < stringToHash.length; i++) {
        let char = stringToHash.charCodeAt(i);
        hash = ((hash<<5)-hash)+char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return hash;
  }

  // Initialize on construct
  this.initHTML();
  this.init();
}

// Create a new Drawing Environment
var drawingEnvironment = new DrawingEnvironment();
