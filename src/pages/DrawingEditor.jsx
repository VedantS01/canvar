import { useState, useEffect, useRef } from 'react';
import './DrawingEditor.css';

// Element types for vector-based drawing
const ELEMENT_TYPES = {
  BRUSH: 'brush',
  ERASER: 'eraser',
  RECTANGLE: 'rectangle',
  CIRCLE: 'circle',
  LINE: 'line',
  TEXT: 'text',
  FILL: 'fill'
};

function DrawingEditor({ onBack, currentDrawing = null }) {
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const svgRef = useRef(null);
  const [drawingName, setDrawingName] = useState('Untitled Drawing');
  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState('#000000');
  const [brushSize, setBrushSize] = useState(5);
  const [canvasContext, setCanvasContext] = useState(null);
  const [tool, setTool] = useState('select'); // Changed default tool to select
  const [drawingHistory, setDrawingHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [isPanelExpanded, setIsPanelExpanded] = useState(false);
  const [isBottomPanelExpanded, setIsBottomPanelExpanded] = useState(false);
  const [isImageLoading, setIsImageLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [currentFileHandle, setCurrentFileHandle] = useState(null);
  
  // Vector-based drawing state
  const [elements, setElements] = useState([]);
  const [action, setAction] = useState('none');
  const [selectedElement, setSelectedElement] = useState(null);
  const [startPosition, setStartPosition] = useState({ x: 0, y: 0 });
  const [currentPath, setCurrentPath] = useState([]);
  const [isScaling, setIsScaling] = useState(false);
  const [scaleDirection, setScaleDirection] = useState(null);
  const [scaleOrigin, setScaleOrigin] = useState({ x: 0, y: 0 });
  const [elementBeforeTransform, setElementBeforeTransform] = useState(null);
  
  // Text tool state
  const [textInput, setTextInput] = useState('');
  const [fontSize, setFontSize] = useState(20);
  const [fontFamily, setFontFamily] = useState('Arial');
  const [isAddingText, setIsAddingText] = useState(false);
  const [textPosition, setTextPosition] = useState({ x: 0, y: 0 });

  // Add a new state to track whether the sidebar is open
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Flood fill algorithm implementation
  const floodFill = (startX, startY, fillColor) => {
    if (!canvasRef.current || !canvasContext) return;
    
    const canvas = canvasRef.current;
    const ctx = canvasContext;
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    const width = imageData.width;
    const height = imageData.height;
    
    // Get the color at the start position
    const startPos = (Math.floor(startY) * width + Math.floor(startX)) * 4;
    const startR = data[startPos];
    const startG = data[startPos + 1];
    const startB = data[startPos + 2];
    const startA = data[startPos + 3];

    // Parse the fill color to RGB
    const fillStyle = document.createElement('div');
    fillStyle.style.color = fillColor;
    document.body.appendChild(fillStyle);
    const computedColor = window.getComputedStyle(fillStyle).color;
    document.body.removeChild(fillStyle);
    
    // Extract RGB values from computed color (format: "rgb(r, g, b)" or "rgba(r, g, b, a)")
    const rgbMatch = computedColor.match(/rgba?\((\d+), (\d+), (\d+)(?:, [\d.]+)?\)/);
    if (!rgbMatch) return;
    
    const fillR = parseInt(rgbMatch[1]);
    const fillG = parseInt(rgbMatch[2]);
    const fillB = parseInt(rgbMatch[3]);
    const fillA = 255; // Fully opaque
    
    // If the start color is the same as fill color, no need to fill
    if (startR === fillR && startG === fillG && startB === fillB) {
      return;
    }
    
    // Queue for flood fill (breadth-first search)
    const queue = [];
    queue.push([startX, startY]);
    
    // Process the queue
    while (queue.length > 0) {
      const [x, y] = queue.shift();
      const pos = (Math.floor(y) * width + Math.floor(x)) * 4;
      
      // Check if this pixel has the start color
      if (
        x >= 0 && x < width && 
        y >= 0 && y < height && 
        data[pos] === startR && 
        data[pos + 1] === startG && 
        data[pos + 2] === startB &&
        data[pos + 3] === startA
      ) {
        // Fill this pixel
        data[pos] = fillR;
        data[pos + 1] = fillG;
        data[pos + 2] = fillB;
        data[pos + 3] = fillA;
        
        // Add neighboring pixels to the queue
        queue.push([x + 1, y]);
        queue.push([x - 1, y]);
        queue.push([x, y + 1]);
        queue.push([x, y - 1]);
      }
    }
    
    // Put the modified image data back on the canvas
    ctx.putImageData(imageData, 0, 0);
    
    // Create a rasterized "image" element from the current canvas state
    const imageElement = {
      id: Date.now().toString(),
      type: 'image',
      x: 0,
      y: 0,
      width: canvas.width,
      height: canvas.height,
      src: canvas.toDataURL('image/png')
    };
    
    // Replace all elements with this image to preserve the fill
    setElements([imageElement]);
    saveToHistory([imageElement]);
  };

  // Initialize the canvas and load the drawing if one is provided
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      // Set canvas size to match its display size
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      
      const context = canvas.getContext('2d');
      context.lineCap = 'round';
      context.lineJoin = 'round';
      setCanvasContext(context);
      
      // If we have a current drawing, load it
      if (currentDrawing && context) {
        loadDrawing(currentDrawing);
      } else {
        // Initialize with empty elements array
        setElements([]);
        saveToHistory([]);
      }
    }
    
    // Handle window resize
    const handleResize = () => {
      if (canvas && canvasContext) {
        // Save current dimensions
        const oldWidth = canvas.width;
        const oldHeight = canvas.height;
        
        // Update canvas size
        canvas.width = canvas.offsetWidth;
        canvas.height = canvas.offsetHeight;
        
        // Scale elements if needed
        const scaleX = canvas.width / oldWidth;
        const scaleY = canvas.height / oldHeight;
        
        if (scaleX !== 1 || scaleY !== 1) {
          setElements(prevElements => 
            prevElements.map(el => {
              // Scale element properties based on type
              switch (el.type) {
                case ELEMENT_TYPES.BRUSH:
                case ELEMENT_TYPES.ERASER:
                  return {
                    ...el,
                    points: el.points.map(point => ({
                      x: point.x * scaleX,
                      y: point.y * scaleY
                    }))
                  };
                case ELEMENT_TYPES.RECTANGLE:
                case ELEMENT_TYPES.LINE:
                  return {
                    ...el,
                    x1: el.x1 * scaleX,
                    y1: el.y1 * scaleY,
                    x2: el.x2 * scaleX,
                    y2: el.y2 * scaleY
                  };
                case ELEMENT_TYPES.CIRCLE:
                  return {
                    ...el,
                    cx: el.cx * scaleX,
                    cy: el.cy * scaleY,
                    rx: el.rx * scaleX,
                    ry: el.ry * scaleY
                  };
                case ELEMENT_TYPES.TEXT:
                  return {
                    ...el,
                    x: el.x * scaleX,
                    y: el.y * scaleY
                  };
                default:
                  return el;
              }
            })
          );
        }
        
        // Redraw all elements
        drawElements();
      }
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [currentDrawing, canvasContext]);

  // Draw all elements whenever they change
  useEffect(() => {
    drawElements();
  }, [elements]);

  // Auto-save whenever elements change
  useEffect(() => {
    // Only auto-save if we have elements and aren't currently loading or saving
    if (elements.length > 0 && !isImageLoading && !isSaving) {
      const autoSaveTimer = setTimeout(() => {
        handleAutoSave();
      }, 2000); // Auto-save after 2 seconds of inactivity
      
      return () => clearTimeout(autoSaveTimer);
    }
  }, [elements, isImageLoading, isSaving]);

  // Add useEffect to open sidebar when an element is selected
  useEffect(() => {
    if (selectedElement) {
      setIsSidebarOpen(true);
    }
  }, [selectedElement]);

  // Load a drawing from the provided file handle or data
  const loadDrawing = async (drawing) => {
    try {
      setIsImageLoading(true);
      
      if (drawing.name) {
        setDrawingName(drawing.name.replace(/\.(svg|json)$/, ''));
      }
      
      let drawingData;
      
      if (drawing.handle && drawing.handle.kind === 'file') {
        // File System Access API
        const file = await drawing.handle.getFile();
        setCurrentFileHandle(drawing.handle);
        
        if (file.name.endsWith('.svg')) {
          // Load SVG (vector format)
          const text = await file.text();
          drawingData = { type: 'svg', content: text };
        } else if (file.name.endsWith('.json')) {
          // Load JSON elements
          const text = await file.text();
          drawingData = { type: 'json', content: JSON.parse(text) };
        } else {
          // Load raster image (backward compatibility)
          drawingData = { type: 'image', content: URL.createObjectURL(file) };
        }
      } else if (drawing.vectorData) {
        // Vector data from localStorage
        drawingData = { type: 'json', content: drawing.vectorData };
      } else if (drawing.data) {
        // Raster data from localStorage (backward compatibility)
        drawingData = { type: 'image', content: drawing.data };
      } else if (drawing.thumbnail) {
        // Use thumbnail as fallback
        drawingData = { type: 'image', content: drawing.thumbnail };
      } else {
        throw new Error('No valid drawing data found');
      }
      
      if (drawingData.type === 'svg') {
        // Parse SVG and convert to our elements format
        const parser = new DOMParser();
        const svgDoc = parser.parseFromString(drawingData.content, 'image/svg+xml');
        const svgElements = parseSvgToElements(svgDoc);
        setElements(svgElements);
        saveToHistory(svgElements);
      } 
      else if (drawingData.type === 'json') {
        // Directly load the elements array
        setElements(drawingData.content);
        saveToHistory(drawingData.content);
      }
      else {
        // Legacy support for raster images
        const img = new Image();
        img.onload = () => {
          const canvas = canvasRef.current;
          
          // Clear the canvas
          canvasContext.clearRect(0, 0, canvas.width, canvas.height);
          
          // Draw the image centered and scaled appropriately
          const aspectRatio = img.width / img.height;
          let drawWidth = canvas.width;
          let drawHeight = drawWidth / aspectRatio;
          
          if (drawHeight > canvas.height) {
            drawHeight = canvas.height;
            drawWidth = drawHeight * aspectRatio;
          }
          
          const x = (canvas.width - drawWidth) / 2;
          const y = (canvas.height - drawHeight) / 2;
          
          canvasContext.drawImage(img, x, y, drawWidth, drawHeight);
          
          // Convert the image to a single image element
          const imageElement = {
            id: Date.now().toString(),
            type: 'image',
            x: x,
            y: y,
            width: drawWidth,
            height: drawHeight,
            src: drawingData.content
          };
          
          setElements([imageElement]);
          saveToHistory([imageElement]);
        };
        
        img.onerror = () => {
          console.error('Failed to load image');
          setElements([]);
          saveToHistory([]);
        };
        
        img.src = drawingData.content;
      }
    } catch (err) {
      console.error('Failed to load drawing:', err);
      setElements([]);
      saveToHistory([]);
    } finally {
      setIsImageLoading(false);
    }
  };

  // Parse SVG to our elements format
  const parseSvgToElements = (svgDoc) => {
    const elements = [];
    const svgElements = svgDoc.querySelectorAll('path, rect, circle, ellipse, line, text');
    
    svgElements.forEach(el => {
      const id = el.getAttribute('id') || Date.now().toString() + Math.random().toString(36).substr(2, 9);
      const stroke = el.getAttribute('stroke') || '#000000';
      const strokeWidth = el.getAttribute('stroke-width') || '1';
      const fill = el.getAttribute('fill');
      
      switch (el.tagName.toLowerCase()) {
        case 'path': {
          const d = el.getAttribute('d');
          if (d) {
            elements.push({
              id,
              type: ELEMENT_TYPES.BRUSH,
              points: parseSvgPath(d),
              strokeColor: stroke,
              strokeWidth: parseFloat(strokeWidth)
            });
          }
          break;
        }
        case 'rect': {
          const x = parseFloat(el.getAttribute('x') || '0');
          const y = parseFloat(el.getAttribute('y') || '0');
          const width = parseFloat(el.getAttribute('width') || '0');
          const height = parseFloat(el.getAttribute('height') || '0');
          elements.push({
            id,
            type: ELEMENT_TYPES.RECTANGLE,
            x1: x,
            y1: y,
            x2: x + width,
            y2: y + height,
            strokeColor: stroke,
            strokeWidth: parseFloat(strokeWidth),
            fillColor: fill === 'none' ? null : fill
          });
          break;
        }
        case 'circle':
        case 'ellipse': {
          const cx = parseFloat(el.getAttribute('cx') || '0');
          const cy = parseFloat(el.getAttribute('cy') || '0');
          const rx = parseFloat(el.getAttribute('rx') || el.getAttribute('r') || '0');
          const ry = parseFloat(el.getAttribute('ry') || el.getAttribute('r') || '0');
          elements.push({
            id,
            type: ELEMENT_TYPES.CIRCLE,
            cx, cy, rx, ry,
            strokeColor: stroke,
            strokeWidth: parseFloat(strokeWidth),
            fillColor: fill === 'none' ? null : fill
          });
          break;
        }
        case 'line': {
          const x1 = parseFloat(el.getAttribute('x1') || '0');
          const y1 = parseFloat(el.getAttribute('y1') || '0');
          const x2 = parseFloat(el.getAttribute('x2') || '0');
          const y2 = parseFloat(el.getAttribute('y2') || '0');
          elements.push({
            id,
            type: ELEMENT_TYPES.LINE,
            x1, y1, x2, y2,
            strokeColor: stroke,
            strokeWidth: parseFloat(strokeWidth)
          });
          break;
        }
        case 'text': {
          const x = parseFloat(el.getAttribute('x') || '0');
          const y = parseFloat(el.getAttribute('y') || '0');
          const fontSize = parseFloat(el.getAttribute('font-size') || '16');
          const fontFamily = el.getAttribute('font-family') || 'Arial';
          elements.push({
            id,
            type: ELEMENT_TYPES.TEXT,
            x, y,
            text: el.textContent,
            fontSize,
            fontFamily,
            fillColor: fill || stroke
          });
          break;
        }
      }
    });
    
    return elements;
  };

  // Helper function to parse SVG path to points
  const parseSvgPath = (d) => {
    const commands = d.match(/[A-Z][^A-Z]*/gi);
    const points = [];
    let currentX = 0;
    let currentY = 0;
    
    if (commands) {
      commands.forEach(cmd => {
        const type = cmd[0];
        const args = cmd.slice(1).trim().split(/[\s,]+/).map(parseFloat);
        
        if (type === 'M') {
          // MoveTo
          currentX = args[0];
          currentY = args[1];
          points.push({ x: currentX, y: currentY });
        } else if (type === 'L') {
          // LineTo
          currentX = args[0];
          currentY = args[1];
          points.push({ x: currentX, y: currentY });
        } else if (type === 'C') {
          // CurveTo - simplify to line segments
          // We're just approximating the curve here with its endpoint
          currentX = args[4];
          currentY = args[5];
          points.push({ x: currentX, y: currentY });
        }
      });
    }
    
    return points;
  };

  const drawElements = () => {
    if (!canvasContext || !canvasRef.current) return;
    
    const canvas = canvasRef.current;
    canvasContext.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw each element based on its type
    elements.forEach(element => {
      drawElement(element);
      
      // Draw selection indicator if the element is selected
      if (selectedElement && element.id === selectedElement.id) {
        drawSelectionBox(element);
      }
    });
    
    // Draw the current path while drawing
    if (isDrawing && currentPath.length > 0) {
      canvasContext.beginPath();
      
      if (tool === ELEMENT_TYPES.BRUSH || tool === ELEMENT_TYPES.ERASER) {
        canvasContext.moveTo(currentPath[0].x, currentPath[0].y);
        currentPath.forEach(point => {
          canvasContext.lineTo(point.x, point.y);
        });
      }
      
      canvasContext.strokeStyle = tool === ELEMENT_TYPES.ERASER ? '#FFFFFF' : color;
      canvasContext.lineWidth = brushSize;
      canvasContext.stroke();
    }
  };

  const drawElement = (element) => {
    if (!canvasContext) return;
    
    canvasContext.beginPath();
    
    switch (element.type) {
      case ELEMENT_TYPES.BRUSH:
        if (element.points.length > 0) {
          canvasContext.moveTo(element.points[0].x, element.points[0].y);
          element.points.forEach(point => {
            canvasContext.lineTo(point.x, point.y);
          });
          canvasContext.strokeStyle = element.strokeColor;
          canvasContext.lineWidth = element.strokeWidth;
          canvasContext.stroke();
        }
        break;
        
      case ELEMENT_TYPES.ERASER:
        if (element.points.length > 0) {
          // For eraser, we draw white lines
          canvasContext.moveTo(element.points[0].x, element.points[0].y);
          element.points.forEach(point => {
            canvasContext.lineTo(point.x, point.y);
          });
          canvasContext.strokeStyle = '#FFFFFF';
          canvasContext.lineWidth = element.strokeWidth;
          canvasContext.stroke();
        }
        break;
        
      case ELEMENT_TYPES.RECTANGLE:
        canvasContext.rect(
          element.x1, 
          element.y1, 
          element.x2 - element.x1, 
          element.y2 - element.y1
        );
        
        if (element.fillColor) {
          canvasContext.fillStyle = element.fillColor;
          canvasContext.fill();
        }
        
        canvasContext.strokeStyle = element.strokeColor;
        canvasContext.lineWidth = element.strokeWidth;
        canvasContext.stroke();
        break;
        
      case ELEMENT_TYPES.CIRCLE:
        canvasContext.ellipse(
          element.cx,
          element.cy,
          element.rx,
          element.ry,
          0,
          0,
          Math.PI * 2
        );
        
        if (element.fillColor) {
          canvasContext.fillStyle = element.fillColor;
          canvasContext.fill();
        }
        
        canvasContext.strokeStyle = element.strokeColor;
        canvasContext.lineWidth = element.strokeWidth;
        canvasContext.stroke();
        break;
        
      case ELEMENT_TYPES.LINE:
        canvasContext.moveTo(element.x1, element.y1);
        canvasContext.lineTo(element.x2, element.y2);
        canvasContext.strokeStyle = element.strokeColor;
        canvasContext.lineWidth = element.strokeWidth;
        canvasContext.stroke();
        break;
        
      case ELEMENT_TYPES.TEXT:
        canvasContext.font = `${element.fontSize}px ${element.fontFamily}`;
        canvasContext.fillStyle = element.fillColor;
        canvasContext.fillText(element.text, element.x, element.y);
        break;
        
      case 'image':
        // Handle legacy images
        if (element.src) {
          const img = new Image();
          img.onload = () => {
            canvasContext.drawImage(img, element.x, element.y, element.width, element.height);
          };
          img.src = element.src;
        }
        break;
    }
  };

  const drawSelectionBox = (element) => {
    // Draw a selection box around the selected element
    if (!canvasContext) return;
    
    let bounds;
    
    switch (element.type) {
      case ELEMENT_TYPES.BRUSH:
      case ELEMENT_TYPES.ERASER:
        // Find bounding box of all points
        if (element.points.length > 0) {
          const xs = element.points.map(p => p.x);
          const ys = element.points.map(p => p.y);
          bounds = {
            x: Math.min(...xs),
            y: Math.min(...ys),
            width: Math.max(...xs) - Math.min(...xs),
            height: Math.max(...ys) - Math.min(...ys)
          };
        }
        break;
      
      case ELEMENT_TYPES.RECTANGLE:
        bounds = {
          x: Math.min(element.x1, element.x2),
          y: Math.min(element.y1, element.y2),
          width: Math.abs(element.x2 - element.x1),
          height: Math.abs(element.y2 - element.y1)
        };
        break;
        
      case ELEMENT_TYPES.CIRCLE:
        bounds = {
          x: element.cx - element.rx,
          y: element.cy - element.ry,
          width: element.rx * 2,
          height: element.ry * 2
        };
        break;
        
      case ELEMENT_TYPES.LINE:
        bounds = {
          x: Math.min(element.x1, element.x2),
          y: Math.min(element.y1, element.y2),
          width: Math.abs(element.x2 - element.x1),
          height: Math.abs(element.y2 - element.y1)
        };
        break;
        
      case ELEMENT_TYPES.TEXT:
        // Approximate text bounds
        canvasContext.font = `${element.fontSize}px ${element.fontFamily}`;
        var metrics = canvasContext.measureText(element.text);
        bounds = {
          x: element.x,
          y: element.y - element.fontSize,
          width: metrics.width,
          height: element.fontSize * 1.2
        };
        break;
        
      case 'image':
        bounds = {
          x: element.x,
          y: element.y,
          width: element.width,
          height: element.height
        };
        break;
    }
    
    if (bounds) {
      // Draw dashed selection border
      canvasContext.setLineDash([5, 5]);
      canvasContext.strokeStyle = '#1a73e8'; // Blue selection border
      canvasContext.lineWidth = 2;
      canvasContext.strokeRect(
        bounds.x - 5,
        bounds.y - 5,
        bounds.width + 10,
        bounds.height + 10
      );
      canvasContext.setLineDash([]);
      
      // Draw resize handles (8 points)
      const handleSize = 10;
      const handles = [
        { x: bounds.x - 5, y: bounds.y - 5, cursor: 'nwse-resize', position: 'nw' },                     // Top-left
        { x: bounds.x + bounds.width / 2 - 5, y: bounds.y - 5, cursor: 'ns-resize', position: 'n' },     // Top-center
        { x: bounds.x + bounds.width + 5 - handleSize, y: bounds.y - 5, cursor: 'nesw-resize', position: 'ne' }, // Top-right
        { x: bounds.x - 5, y: bounds.y + bounds.height / 2 - 5, cursor: 'ew-resize', position: 'w' },    // Middle-left
        { x: bounds.x + bounds.width + 5 - handleSize, y: bounds.y + bounds.height / 2 - 5, cursor: 'ew-resize', position: 'e' }, // Middle-right
        { x: bounds.x - 5, y: bounds.y + bounds.height + 5 - handleSize, cursor: 'nesw-resize', position: 'sw' }, // Bottom-left
        { x: bounds.x + bounds.width / 2 - 5, y: bounds.y + bounds.height + 5 - handleSize, cursor: 'ns-resize', position: 's' }, // Bottom-center
        { x: bounds.x + bounds.width + 5 - handleSize, y: bounds.y + bounds.height + 5 - handleSize, cursor: 'nwse-resize', position: 'se' } // Bottom-right
      ];
      
      canvasContext.fillStyle = '#ffffff';
      canvasContext.lineWidth = 2;
      canvasContext.strokeStyle = '#1a73e8'; // Blue handles
      
      handles.forEach(handle => {
        canvasContext.fillRect(handle.x, handle.y, handleSize, handleSize);
        canvasContext.strokeRect(handle.x, handle.y, handleSize, handleSize);
      });
      
      // Draw central control point for moving
      const centerX = bounds.x + bounds.width / 2 - 7;
      const centerY = bounds.y + bounds.height / 2 - 7;
      const centerHandleSize = 14;
      
      // Draw a more visible center handle
      canvasContext.fillStyle = '#1a73e8'; // Blue fill
      canvasContext.beginPath();
      canvasContext.arc(centerX + 7, centerY + 7, 10, 0, Math.PI * 2);
      canvasContext.fill();
      canvasContext.fillStyle = '#ffffff'; // White cross
      
      // Draw plus/move symbol inside
      canvasContext.fillRect(centerX + 3, centerY + 7, 8, 2); // Horizontal line
      canvasContext.fillRect(centerX + 7, centerY + 3, 2, 8); // Vertical line
    }
  };

  const getHandleAtPosition = (x, y, element) => {
    if (!element) return null;
    
    let bounds;
    
    switch (element.type) {
      case ELEMENT_TYPES.BRUSH:
      case ELEMENT_TYPES.ERASER:
        if (element.points.length > 0) {
          const xs = element.points.map(p => p.x);
          const ys = element.points.map(p => p.y);
          bounds = {
            x: Math.min(...xs),
            y: Math.min(...ys),
            width: Math.max(...xs) - Math.min(...xs),
            height: Math.max(...ys) - Math.min(...ys)
          };
        }
        break;
      
      case ELEMENT_TYPES.RECTANGLE:
        bounds = {
          x: Math.min(element.x1, element.x2),
          y: Math.min(element.y1, element.y2),
          width: Math.abs(element.x2 - element.x1),
          height: Math.abs(element.y2 - element.y1)
        };
        break;
        
      case ELEMENT_TYPES.CIRCLE:
        bounds = {
          x: element.cx - element.rx,
          y: element.cy - element.ry,
          width: element.rx * 2,
          height: element.ry * 2
        };
        break;
        
      case ELEMENT_TYPES.LINE:
        bounds = {
          x: Math.min(element.x1, element.x2),
          y: Math.min(element.y1, element.y2),
          width: Math.abs(element.x2 - element.x1),
          height: Math.abs(element.y2 - element.y1)
        };
        break;
        
      case ELEMENT_TYPES.TEXT:
        // Approximate text bounds
        canvasContext.font = `${element.fontSize}px ${element.fontFamily}`;
        var metrics = canvasContext.measureText(element.text);
        bounds = {
          x: element.x,
          y: element.y - element.fontSize,
          width: metrics.width,
          height: element.fontSize * 1.2
        };
        break;
        
      case 'image':
        bounds = {
          x: element.x,
          y: element.y,
          width: element.width,
          height: element.height
        };
        break;
    }
    
    if (!bounds) return null;
    
    const handleSize = 10;
    const handles = [
      { x: bounds.x - 5, y: bounds.y - 5, cursor: 'nwse-resize', position: 'nw' },
      { x: bounds.x + bounds.width / 2 - 5, y: bounds.y - 5, cursor: 'ns-resize', position: 'n' },
      { x: bounds.x + bounds.width + 5 - handleSize, y: bounds.y - 5, cursor: 'nesw-resize', position: 'ne' },
      { x: bounds.x - 5, y: bounds.y + bounds.height / 2 - 5, cursor: 'ew-resize', position: 'w' },
      { x: bounds.x + bounds.width + 5 - handleSize, y: bounds.y + bounds.height / 2 - 5, cursor: 'ew-resize', position: 'e' },
      { x: bounds.x - 5, y: bounds.y + bounds.height + 5 - handleSize, cursor: 'nesw-resize', position: 'sw' },
      { x: bounds.x + bounds.width / 2 - 5, y: bounds.y + bounds.height + 5 - handleSize, cursor: 'ns-resize', position: 's' },
      { x: bounds.x + bounds.width + 5 - handleSize, y: bounds.y + bounds.height + 5 - handleSize, cursor: 'nwse-resize', position: 'se' }
    ];
    
    for (const handle of handles) {
      if (
        x >= handle.x && 
        x <= handle.x + handleSize &&
        y >= handle.y && 
        y <= handle.y + handleSize
      ) {
        return handle;
      }
    }
    
    return null;
  };

  const saveToHistory = (newElements) => {
    // If we're not at the end of the history, remove future states
    if (historyIndex < drawingHistory.length - 1) {
      setDrawingHistory(prev => prev.slice(0, historyIndex + 1));
    }
    
    // Add current state to history
    setDrawingHistory(prev => [...prev, JSON.parse(JSON.stringify(newElements))]);
    setHistoryIndex(prev => prev + 1);
  };

  const undo = () => {
    if (historyIndex > 0) {
      setHistoryIndex(prevIndex => prevIndex - 1);
      setElements(drawingHistory[historyIndex - 1]);
    }
  };

  const redo = () => {
    if (historyIndex < drawingHistory.length - 1) {
      setHistoryIndex(prevIndex => prevIndex + 1);
      setElements(drawingHistory[historyIndex + 1]);
    }
  };

  const getCoordinates = (e) => {
    if (e.type.includes('touch')) {
      const touch = e.touches[0];
      const rect = canvasRef.current.getBoundingClientRect();
      return {
        x: touch.clientX - rect.left,
        y: touch.clientY - rect.top
      };
    } else {
      return {
        x: e.nativeEvent.offsetX,
        y: e.nativeEvent.offsetY
      };
    }
  };

  const startDrawing = (e) => {
    const { x, y } = getCoordinates(e);
    
    // For selection tool, check if we clicked on a handle or an element
    if (tool === 'select') {
      if (selectedElement) {
        // Check if we're clicking on the center control point
        const bounds = getBoundsForElement(selectedElement);
        if (bounds) {
          const centerX = bounds.x + bounds.width / 2 - 7;
          const centerY = bounds.y + bounds.height / 2 - 7;
          const centerHandleSize = 14;
          
          // Check if click is within the center control point
          if (
            x >= centerX && 
            x <= centerX + centerHandleSize && 
            y >= centerY && 
            y <= centerY + centerHandleSize
          ) {
            // Start moving the element using the center control point
            setAction('moving');
            setStartPosition({ x, y });
            return;
          }
        }
        
        // Check if we clicked on a resize handle
        const handle = getHandleAtPosition(x, y, selectedElement);
        if (handle) {
          // Start scaling using the resize handle
          setIsScaling(true);
          setScaleDirection(handle.position);
          setScaleOrigin({ x, y });
          setElementBeforeTransform(JSON.parse(JSON.stringify(selectedElement)));
          return;
        }
      }
      
      const clickedElement = getElementAtPosition(x, y);
      
      if (clickedElement) {
        // Element clicked - select it but don't move yet
        setSelectedElement(clickedElement);
        setIsSidebarOpen(true); // Ensure sidebar opens when element is selected
      } else {
        // Clicked on empty space - deselect element and close sidebar
        setSelectedElement(null);
        setIsSidebarOpen(false); // Close the sidebar when no element is selected
      }
      return;
    }
    
    // For text tool, just set the position and activate text input
    if (tool === ELEMENT_TYPES.TEXT) {
      setTextPosition({ x, y });
      setIsAddingText(true);
      return;
    }
    
    // For fill tool, perform flood fill
    if (tool === ELEMENT_TYPES.FILL) {
      floodFill(x, y, color);
      return;
    }
    
    // For all other tools, start creating a new element
    setIsDrawing(true);
    setStartPosition({ x, y });
    setCurrentPath([{ x, y }]);
    
    if (tool === ELEMENT_TYPES.BRUSH || tool === ELEMENT_TYPES.ERASER) {
      // For brush and eraser, start a path
      const newElement = {
        id: Date.now().toString(),
        type: tool,
        points: [{ x, y }],
        strokeColor: tool === ELEMENT_TYPES.ERASER ? '#FFFFFF' : color,
        strokeWidth: brushSize
      };
      
      setElements(prevElements => [...prevElements, newElement]);
    } else if (tool === ELEMENT_TYPES.RECTANGLE || tool === ELEMENT_TYPES.LINE) {
      // For rectangle and line, create element with start and end at same point initially
      const newElement = {
        id: Date.now().toString(),
        type: tool,
        x1: x,
        y1: y,
        x2: x,
        y2: y,
        strokeColor: color,
        strokeWidth: brushSize,
        fillColor: null // Will be filled based on user preference
      };
      
      setElements(prevElements => [...prevElements, newElement]);
    } else if (tool === ELEMENT_TYPES.CIRCLE) {
      // For circle, create with radius 0 initially
      const newElement = {
        id: Date.now().toString(),
        type: tool,
        cx: x,
        cy: y,
        rx: 0,
        ry: 0,
        strokeColor: color,
        strokeWidth: brushSize,
        fillColor: null // Will be filled based on user preference
      };
      
      setElements(prevElements => [...prevElements, newElement]);
    }
  };

  const draw = (e) => {
    if (!isDrawing && action !== 'moving' && !isScaling) return;
    
    const { x, y } = getCoordinates(e);
    
    // Handle scaling
    if (isScaling && selectedElement) {
      
      // Apply scaling based on direction and cursor position
      setElements(prevElements => prevElements.map(el => {
        if (el.id === selectedElement.id) {
          const scaledElement = scaleElement(
            elementBeforeTransform, 
            scaleDirection, 
            x, 
            y, 
            scaleOrigin
          );
          return scaledElement;
        }
        return el;
      }));
      return;
    }
    
    // Handle moving elements
    if (action === 'moving' && selectedElement) {
      // Move the selected element
      const dx = x - startPosition.x;
      const dy = y - startPosition.y;
      
      setElements(prevElements => prevElements.map(el => {
        if (el.id === selectedElement.id) {
          return moveElement(el, dx, dy);
        }
        return el;
      }));
      
      setStartPosition({ x, y });
      return;
    }
    
    // For active drawing
    if (isDrawing) {
      // Add point to the current path for visualization
      setCurrentPath(prev => [...prev, { x, y }]);
      
      // Update the element based on its type
      setElements(prevElements => {
        const lastIndex = prevElements.length - 1;
        const updatedElements = [...prevElements];
        
        if (lastIndex >= 0) {
          switch (tool) {
            case ELEMENT_TYPES.BRUSH:
            case ELEMENT_TYPES.ERASER:
              // Add point to path
              updatedElements[lastIndex] = {
                ...updatedElements[lastIndex],
                points: [...updatedElements[lastIndex].points, { x, y }]
              };
              break;
            case ELEMENT_TYPES.RECTANGLE:
            case ELEMENT_TYPES.LINE:
              // Update end point
              updatedElements[lastIndex] = {
                ...updatedElements[lastIndex],
                x2: x,
                y2: y
              };
              break;
            case ELEMENT_TYPES.CIRCLE:
              // Update radius based on distance
              var dx = x - updatedElements[lastIndex].cx;
              var dy = y - updatedElements[lastIndex].cy;
              updatedElements[lastIndex] = {
                ...updatedElements[lastIndex],
                rx: Math.abs(dx),
                ry: Math.abs(dy)
              };
              break;
          }
        }
        
        return updatedElements;
      });
    }
  };

  const moveElement = (element, dx, dy) => {
    switch (element.type) {
      case ELEMENT_TYPES.BRUSH:
      case ELEMENT_TYPES.ERASER:
        return {
          ...element,
          points: element.points.map(point => ({
            x: point.x + dx,
            y: point.y + dy
          }))
        };
      case ELEMENT_TYPES.RECTANGLE:
      case ELEMENT_TYPES.LINE:
        return {
          ...element,
          x1: element.x1 + dx,
          y1: element.y1 + dy,
          x2: element.x2 + dx,
          y2: element.y2 + dy
        };
      case ELEMENT_TYPES.CIRCLE:
        return {
          ...element,
          cx: element.cx + dx,
          cy: element.cy + dy
        };
      case ELEMENT_TYPES.TEXT:
        return {
          ...element,
          x: element.x + dx,
          y: element.y + dy
        };
      case 'image':
        return {
          ...element,
          x: element.x + dx,
          y: element.y + dy
        };
      default:
        return element;
    }
  };

  const getBoundsForElement = (element) => {
    switch (element.type) {
      case ELEMENT_TYPES.BRUSH:
      case ELEMENT_TYPES.ERASER:
        if (element.points.length > 0) {
          const xs = element.points.map(p => p.x);
          const ys = element.points.map(p => p.y);
          return {
            x: Math.min(...xs),
            y: Math.min(...ys),
            width: Math.max(...xs) - Math.min(...xs),
            height: Math.max(...ys) - Math.min(...ys),
            centerX: (Math.min(...xs) + Math.max(...xs)) / 2,
            centerY: (Math.min(...ys) + Math.max(...ys)) / 2
          };
        }
        return null;
        
      case ELEMENT_TYPES.RECTANGLE:
        return {
          x: Math.min(element.x1, element.x2),
          y: Math.min(element.y1, element.y2),
          width: Math.abs(element.x2 - element.x1),
          height: Math.abs(element.y2 - element.y1),
          centerX: (element.x1 + element.x2) / 2,
          centerY: (element.y1 + element.y2) / 2
        };
        
      case ELEMENT_TYPES.CIRCLE:
        return {
          x: element.cx - element.rx,
          y: element.cy - element.ry,
          width: element.rx * 2,
          height: element.ry * 2,
          centerX: element.cx,
          centerY: element.cy
        };
        
      case ELEMENT_TYPES.LINE:
        return {
          x: Math.min(element.x1, element.x2),
          y: Math.min(element.y1, element.y2),
          width: Math.abs(element.x2 - element.x1),
          height: Math.abs(element.y2 - element.y1),
          centerX: (element.x1 + element.x2) / 2,
          centerY: (element.y1 + element.y2) / 2
        };
        
      case ELEMENT_TYPES.TEXT:
        canvasContext.font = `${element.fontSize}px ${element.fontFamily}`;
        var metrics = canvasContext.measureText(element.text);
        return {
          x: element.x,
          y: element.y - element.fontSize,
          width: metrics.width,
          height: element.fontSize * 1.2,
          centerX: element.x + metrics.width / 2,
          centerY: element.y - element.fontSize / 2
        };
        
      case 'image':
        return {
          x: element.x,
          y: element.y,
          width: element.width,
          height: element.height,
          centerX: element.x + element.width / 2,
          centerY: element.y + element.height / 2
        };
        
      default:
        return null;
    }
  };

  const scaleElement = (element, direction, mouseX, mouseY, origin) => {
    const bounds = getBoundsForElement(element);
    if (!bounds) return element;
    
    // Calculate scale factors
    let newWidth, newHeight, newX, newY;
    const dx = mouseX - origin.x;
    const dy = mouseY - origin.y;
    
    switch (direction) {
      case 'nw':
        newWidth = bounds.width - dx;
        newHeight = bounds.height - dy;
        newX = bounds.x + dx;
        newY = bounds.y + dy;
        break;
      case 'n':
        newWidth = bounds.width;
        newHeight = bounds.height - dy;
        newX = bounds.x;
        newY = bounds.y + dy;
        break;
      case 'ne':
        newWidth = bounds.width + dx;
        newHeight = bounds.height - dy;
        newX = bounds.x;
        newY = bounds.y + dy;
        break;
      case 'e':
        newWidth = bounds.width + dx;
        newHeight = bounds.height;
        newX = bounds.x;
        newY = bounds.y;
        break;
      case 'se':
        newWidth = bounds.width + dx;
        newHeight = bounds.height + dy;
        newX = bounds.x;
        newY = bounds.y;
        break;
      case 's':
        newWidth = bounds.width;
        newHeight = bounds.height + dy;
        newX = bounds.x;
        newY = bounds.y;
        break;
      case 'sw':
        newWidth = bounds.width - dx;
        newHeight = bounds.height + dy;
        newX = bounds.x + dx;
        newY = bounds.y;
        break;
      case 'w':
        newWidth = bounds.width - dx;
        newHeight = bounds.height;
        newX = bounds.x + dx;
        newY = bounds.y;
        break;
      default:
        return element;
    }
    
    // Ensure minimum size
    if (newWidth < 5) newWidth = 5;
    if (newHeight < 5) newHeight = 5;
    
    // Apply scaling
    switch (element.type) {
      case ELEMENT_TYPES.RECTANGLE:
        return {
          ...element,
          x1: newX,
          y1: newY,
          x2: newX + newWidth,
          y2: newY + newHeight
        };
        
      case ELEMENT_TYPES.CIRCLE:
        return {
          ...element,
          cx: newX + newWidth / 2,
          cy: newY + newHeight / 2,
          rx: newWidth / 2,
          ry: newHeight / 2
        };
        
      case ELEMENT_TYPES.LINE:
        // For simplicity, we'll just scale the line as if it were a rectangle
        return {
          ...element,
          x1: newX,
          y1: newY,
          x2: newX + newWidth,
          y2: newY + newHeight
        };
        
      case ELEMENT_TYPES.TEXT:
        // For text, we'll adjust the font size proportionally
        var scaleFactor = newWidth / bounds.width;
        return {
          ...element,
          x: newX,
          y: newY + newHeight,
          fontSize: Math.max(12, Math.round(element.fontSize * Math.sqrt(scaleFactor)))
        };
        
      case 'image':
        return {
          ...element,
          x: newX,
          y: newY,
          width: newWidth,
          height: newHeight
        };
        
      case ELEMENT_TYPES.BRUSH:
      case ELEMENT_TYPES.ERASER:
        // Scale points relative to the center
        var scaleX = newWidth / bounds.width;
        var scaleY = newHeight / bounds.height;
        var centerX = bounds.centerX;
        var centerY = bounds.centerY;
        
        return {
          ...element,
          points: element.points.map(point => ({
            x: centerX + (point.x - centerX) * scaleX,
            y: centerY + (point.y - centerY) * scaleY
          }))
        };
        
      default:
        return element;
    }
  };

  const stopDrawing = () => {
    if (isDrawing) {
      // Finalize the element
      setIsDrawing(false);
      setCurrentPath([]);
      
      // Set tool to 'select' after drawing an element (except brush/eraser)
      if (tool !== ELEMENT_TYPES.BRUSH && tool !== ELEMENT_TYPES.ERASER) {
        // Select the newly created element
        const lastElement = elements[elements.length - 1];
        setSelectedElement(lastElement);
        setTool('select');
      }
      
      saveToHistory([...elements]);
    } else if (action === 'moving') {
      // Finish moving
      setAction('none');
      saveToHistory([...elements]);
    } else if (isScaling) {
      // Finish scaling
      setIsScaling(false);
      setScaleDirection(null);
      setElementBeforeTransform(null);
      saveToHistory([...elements]);
    }
  };

  const getElementAtPosition = (x, y) => {
    // Search in reverse order (top-most elements first)
    for (let i = elements.length - 1; i >= 0; i--) {
      const element = elements[i];
      
      if (isPointInElement(x, y, element)) {
        return element;
      }
    }
    
    return null;
  };

  const isPointInElement = (x, y, element) => {
    switch (element.type) {
      case ELEMENT_TYPES.BRUSH:
      case ELEMENT_TYPES.ERASER:
        // Check distance to any point in the path
        return element.points.some(point => {
          const distance = Math.sqrt(Math.pow(x - point.x, 2) + Math.pow(y - point.y, 2));
          return distance <= element.strokeWidth / 2 + 5; // Extra 5px for easier selection
        });
        
      case ELEMENT_TYPES.RECTANGLE:
        var rect = {
          x: Math.min(element.x1, element.x2),
          y: Math.min(element.y1, element.y2),
          width: Math.abs(element.x2 - element.x1),
          height: Math.abs(element.y2 - element.y1)
        };
        return (
          x >= rect.x - 5 && 
          x <= rect.x + rect.width + 5 && 
          y >= rect.y - 5 && 
          y <= rect.y + rect.height + 5
        );
        
      case ELEMENT_TYPES.CIRCLE:
        // Check if point is within the ellipse
        var normalizedX = (x - element.cx) / element.rx;
        var normalizedY = (y - element.cy) / element.ry;
        return (Math.pow(normalizedX, 2) + Math.pow(normalizedY, 2)) <= 1 + 0.1; // Extra 10% for easier selection
        
      case ELEMENT_TYPES.LINE:
        // Distance from point to line segment
        var A = x - element.x1;
        var B = y - element.y1;
        var C = element.x2 - element.x1;
        var D = element.y2 - element.y1;
        
        var dot = A * C + B * D;
        var len_sq = C * C + D * D;
        var param = -1;
        
        if (len_sq !== 0) param = dot / len_sq;
        
        var xx, yy;
        
        if (param < 0) {
          xx = element.x1;
          yy = element.y1;
        } else if (param > 1) {
          xx = element.x2;
          yy = element.y2;
        } else {
          xx = element.x1 + param * C;
          yy = element.y1 + param * D;
        }
        
        var dx = x - xx;
        var dy = y - yy;
        var distance = Math.sqrt(dx * dx + dy * dy);
        return distance <= element.strokeWidth / 2 + 5;
        
      case ELEMENT_TYPES.TEXT:
        // Approximate text bounds
        canvasContext.font = `${element.fontSize}px ${element.fontFamily}`;
        var metrics = canvasContext.measureText(element.text);
        return (
          x >= element.x - 5 && 
          x <= element.x + metrics.width + 5 && 
          y >= element.y - element.fontSize - 5 && 
          y <= element.y + 5
        );
        
      case 'image':
        return (
          x >= element.x - 5 && 
          x <= element.x + element.width + 5 && 
          y >= element.y - 5 && 
          y <= element.y + element.height + 5
        );
        
      default:
        return false;
    }
  };

  const handleTextSubmit = (e) => {
    e.preventDefault();
    
    if (textInput && isAddingText) {
      // Create a new text element
      const newElement = {
        id: Date.now().toString(),
        type: ELEMENT_TYPES.TEXT,
        x: textPosition.x,
        y: textPosition.y,
        text: textInput,
        fontSize,
        fontFamily,
        fillColor: color
      };
      
      setElements(prev => [...prev, newElement]);
      setTextInput('');
      setIsAddingText(false);
      
      // Select the newly created text element and switch to select tool
      setSelectedElement(newElement);
      setTool('select');
      
      saveToHistory([...elements, newElement]);
    }
  };

  const cancelTextInput = () => {
    setTextInput('');
    setIsAddingText(false);
  };

  const handleClearCanvas = () => {
    if (window.confirm('Are you sure you want to clear the canvas? This action cannot be undone.')) {
      setElements([]);
      saveToHistory([]);
    }
  };

  const exportToSVG = () => {
    const canvas = canvasRef.current;
    
    // Create SVG document
    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("width", canvas.width);
    svg.setAttribute("height", canvas.height);
    svg.setAttribute("viewBox", `0 0 ${canvas.width} ${canvas.height}`);
    
    // Add each element to SVG
    elements.forEach(element => {
      switch (element.type) {
        case ELEMENT_TYPES.BRUSH:
        case ELEMENT_TYPES.ERASER:
          if (element.points.length > 0) {
            // Create path element
            const path = document.createElementNS(svgNS, "path");
            let d = `M ${element.points[0].x} ${element.points[0].y}`;
            
            element.points.slice(1).forEach(point => {
              d += ` L ${point.x} ${point.y}`;
            });
            
            path.setAttribute("d", d);
            path.setAttribute("stroke", element.strokeColor);
            path.setAttribute("stroke-width", element.strokeWidth);
            path.setAttribute("fill", "none");
            path.setAttribute("id", element.id);
            svg.appendChild(path);
          }
          break;
          
        case ELEMENT_TYPES.RECTANGLE:
          var rect = document.createElementNS(svgNS, "rect");
          rect.setAttribute("x", Math.min(element.x1, element.x2));
          rect.setAttribute("y", Math.min(element.y1, element.y2));
          rect.setAttribute("width", Math.abs(element.x2 - element.x1));
          rect.setAttribute("height", Math.abs(element.y2 - element.y1));
          rect.setAttribute("stroke", element.strokeColor);
          rect.setAttribute("stroke-width", element.strokeWidth);
          rect.setAttribute("fill", element.fillColor || "none");
          rect.setAttribute("id", element.id);
          svg.appendChild(rect);
          break;
          
        case ELEMENT_TYPES.CIRCLE:
          var ellipse = document.createElementNS(svgNS, "ellipse");
          ellipse.setAttribute("cx", element.cx);
          ellipse.setAttribute("cy", element.cy);
          ellipse.setAttribute("rx", element.rx);
          ellipse.setAttribute("ry", element.ry);
          ellipse.setAttribute("stroke", element.strokeColor);
          ellipse.setAttribute("stroke-width", element.strokeWidth);
          ellipse.setAttribute("fill", element.fillColor || "none");
          ellipse.setAttribute("id", element.id);
          svg.appendChild(ellipse);
          break;
          
        case ELEMENT_TYPES.LINE:
          var line = document.createElementNS(svgNS, "line");
          line.setAttribute("x1", element.x1);
          line.setAttribute("y1", element.y1);
          line.setAttribute("x2", element.x2);
          line.setAttribute("y2", element.y2);
          line.setAttribute("stroke", element.strokeColor);
          line.setAttribute("stroke-width", element.strokeWidth);
          line.setAttribute("id", element.id);
          svg.appendChild(line);
          break;
          
        case ELEMENT_TYPES.TEXT:
          var text = document.createElementNS(svgNS, "text");
          text.setAttribute("x", element.x);
          text.setAttribute("y", element.y);
          text.setAttribute("font-family", element.fontFamily);
          text.setAttribute("font-size", element.fontSize);
          text.setAttribute("fill", element.fillColor);
          text.setAttribute("id", element.id);
          text.textContent = element.text;
          svg.appendChild(text);
          break;
          
        case 'image':
          // Images are complex in SVG, we'd need to embed them as base64
          // This is just a placeholder approach
          var image = document.createElementNS(svgNS, "image");
          image.setAttribute("x", element.x);
          image.setAttribute("y", element.y);
          image.setAttribute("width", element.width);
          image.setAttribute("height", element.height);
          image.setAttribute("id", element.id);
          if (element.src && element.src.startsWith('data:')) {
            image.setAttribute("href", element.src);
          }
          svg.appendChild(image);
          break;
      }
    });
    
    // Serialize SVG to string
    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(svg);
    
    return svgString;
  };

  const handleAutoSave = async () => {
    if (elements.length === 0) return;
    
    try {
      // Only perform auto-save if we have a file handle or can create one
      if ('storage' in navigator && 'getDirectory' in navigator.storage) {
        const root = await navigator.storage.getDirectory();
        const drawingsDir = await root.getDirectoryHandle('drawings', { create: true });
        
        // Use the current name or generate one
        const filename = (drawingName || 'drawing') + '.svg';
        const jsonFilename = (drawingName || 'drawing') + '.json';
        
        // Get or create the file handles
        let svgFileHandle, jsonFileHandle;
        
        if (currentFileHandle && currentFileHandle.name === filename) {
          svgFileHandle = currentFileHandle;
        } else {
          svgFileHandle = await drawingsDir.getFileHandle(filename, { create: true });
          setCurrentFileHandle(svgFileHandle);
        }
        
        jsonFileHandle = await drawingsDir.getFileHandle(jsonFilename, { create: true });
        
        // Export to SVG
        const svgContent = exportToSVG();
        
        // Save JSON data for elements
        const jsonContent = JSON.stringify(elements);
        
        // Write to files
        const svgWritable = await svgFileHandle.createWritable();
        await svgWritable.write(svgContent);
        await svgWritable.close();
        
        const jsonWritable = await jsonFileHandle.createWritable();
        await jsonWritable.write(jsonContent);
        await jsonWritable.close();
        
        // Generate a thumbnail
        const canvas = canvasRef.current;
        const thumbnailCanvas = document.createElement('canvas');
        const thumbnailCtx = thumbnailCanvas.getContext('2d');
        thumbnailCanvas.width = 250;
        thumbnailCanvas.height = 180;
        
        // Draw a scaled-down version of the canvas
        thumbnailCtx.fillStyle = '#f8f9fa';
        thumbnailCtx.fillRect(0, 0, 250, 180);
        thumbnailCtx.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, 250, 180);
        
        const thumbnailBlob = await new Promise(resolve => {
          thumbnailCanvas.toBlob(resolve, 'image/jpeg', 0.7);
        });
        
        // Save thumbnail with the same name
        const thumbName = filename.replace('.svg', '-thumb.jpg');
        const thumbHandle = await drawingsDir.getFileHandle(thumbName, { create: true });
        const thumbWritable = await thumbHandle.createWritable();
        await thumbWritable.write(thumbnailBlob);
        await thumbWritable.close();
      } else {
        // Fallback to localStorage for browsers without File System Access API
        const svgContent = exportToSVG();
        const thumbnailDataUrl = canvasRef.current.toDataURL('image/jpeg', 0.5);
        
        const savedDrawings = JSON.parse(localStorage.getItem('drawings') || '[]');
        const drawingId = currentDrawing?.id || Date.now().toString();
        
        const drawingData = {
          id: drawingId,
          name: drawingName || 'Untitled Drawing',
          created: new Date().toISOString(),
          data: canvasRef.current.toDataURL('image/png'),
          svg: svgContent,
          vectorData: elements,
          thumbnail: thumbnailDataUrl
        };
        
        // Update if exists, otherwise add new
        const existingIndex = savedDrawings.findIndex(d => d.id === drawingId);
        if (existingIndex >= 0) {
          savedDrawings[existingIndex] = drawingData;
        } else {
          savedDrawings.push(drawingData);
        }
        
        localStorage.setItem('drawings', JSON.stringify(savedDrawings));
      }
    } catch (err) {
      console.error('Auto-save failed:', err);
      // Don't show alerts for auto-save failures
    }
  };

  const handleSaveCanvas = async () => {
    try {
      setIsSaving(true);
      await handleAutoSave();
      alert('Drawing saved successfully!');
    } catch (err) {
      console.error('Failed to save drawing:', err);
      alert('Failed to save drawing. ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDownloadCanvas = () => {
    const svgContent = exportToSVG();
    const blob = new Blob([svgContent], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.download = `${drawingName || 'drawing'}.svg`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleUploadImage = () => {
    fileInputRef.current.click();
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Check if file is an image
    if (!file.type.match('image.*')) {
      alert('Please select an image file');
      return;
    }

    setIsImageLoading(true);

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = canvasRef.current;
        
        if (canvas) {
          // Determine dimensions while maintaining aspect ratio
          let drawWidth = img.width;
          let drawHeight = img.height;
          const maxWidth = canvas.width * 0.9; // 90% of canvas width
          const maxHeight = canvas.height * 0.9; // 90% of canvas height
          
          // Scale down if image is larger than canvas
          if (drawWidth > maxWidth || drawHeight > maxHeight) {
            const ratio = Math.min(maxWidth / drawWidth, maxHeight / drawHeight);
            drawWidth *= ratio;
            drawHeight *= ratio;
          }
          
          // Calculate position to center the image
          const x = (canvas.width - drawWidth) / 2;
          const y = (canvas.height - drawHeight) / 2;
          
          // Add image as an element
          const newElement = {
            id: Date.now().toString(),
            type: 'image',
            x: x,
            y: y,
            width: drawWidth,
            height: drawHeight,
            src: event.target.result
          };
          
          setElements(prev => [...prev, newElement]);
          setIsImageLoading(false);
          saveToHistory([...elements, newElement]);
        }
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
    
    // Clear the file input value so the same file can be selected again
    e.target.value = '';
  };

  const togglePanel = () => {
    setIsPanelExpanded(!isPanelExpanded);
  };
  
  const toggleBottomPanel = () => {
    setIsBottomPanelExpanded(!isBottomPanelExpanded);
  };

  const handleNameChange = (e) => {
    setDrawingName(e.target.value);
  };

  // When in minimized mode, the toolbar should be a single line
  // We'll create a more simplified toolbar that has only the most essential controls
  const renderMinimizedToolbar = () => (
    <div className="tool-panel">
      <div className="drawing-tools">
        <button 
          className={tool === 'select' ? 'active' : ''} 
          onClick={() => setTool('select')}
          title="Select & Move"
        >
          👆
        </button>
        <button 
          className={tool === ELEMENT_TYPES.BRUSH ? 'active' : ''} 
          onClick={() => setTool(ELEMENT_TYPES.BRUSH)}
          title="Brush"
        >
          🖌️
        </button>
        <button 
          className={tool === ELEMENT_TYPES.ERASER ? 'active' : ''} 
          onClick={() => setTool(ELEMENT_TYPES.ERASER)}
          title="Eraser"
        >
          🧽
        </button>
        <button 
          className={tool === ELEMENT_TYPES.FILL ? 'active' : ''} 
          onClick={() => setTool(ELEMENT_TYPES.FILL)}
          title="Fill"
        >
          🪣
        </button>
      </div>
      
      <div className="tool-divider"></div>
      
      <div className="drawing-tools">
        <button 
          className={tool === ELEMENT_TYPES.RECTANGLE ? 'active' : ''} 
          onClick={() => setTool(ELEMENT_TYPES.RECTANGLE)}
          title="Rectangle"
        >
          □
        </button>
        <button 
          className={tool === ELEMENT_TYPES.CIRCLE ? 'active' : ''} 
          onClick={() => setTool(ELEMENT_TYPES.CIRCLE)}
          title="Circle"
        >
          ○
        </button>
        <button 
          className={tool === ELEMENT_TYPES.LINE ? 'active' : ''} 
          onClick={() => setTool(ELEMENT_TYPES.LINE)}
          title="Line"
        >
          ╱
        </button>
      </div>
      
      <div className="tool-divider"></div>
      
      <div className="color-picker">
        <input 
          type="color" 
          id="color" 
          value={color} 
          onChange={(e) => setColor(e.target.value)} 
          title="Color Picker"
        />
      </div>
      
      <div className="brush-size">
        <input 
          type="range" 
          id="brush-size" 
          min="1" 
          max="50" 
          value={brushSize} 
          onChange={(e) => setBrushSize(parseInt(e.target.value))} 
          title={`Brush Size: ${brushSize}px`}
        />
      </div>
      
      <button className="toggle-panel" onClick={togglePanel} title="Expand Toolbar">
        ▼
      </button>
    </div>
  );

  // In expanded mode, we'll show a more comprehensive toolbar below the drawing title
  const renderExpandedToolbar = () => (
    <div className="tool-panel expanded">
      <div className="drawing-tools">
        <button 
          className={tool === 'select' ? 'active' : ''} 
          onClick={() => setTool('select')}
        >
          Select
        </button>
        <button 
          className={tool === ELEMENT_TYPES.BRUSH ? 'active' : ''} 
          onClick={() => setTool(ELEMENT_TYPES.BRUSH)}
        >
          Brush
        </button>
        <button 
          className={tool === ELEMENT_TYPES.ERASER ? 'active' : ''} 
          onClick={() => setTool(ELEMENT_TYPES.ERASER)}
        >
          Eraser
        </button>
        <button 
          className={tool === ELEMENT_TYPES.FILL ? 'active' : ''} 
          onClick={() => setTool(ELEMENT_TYPES.FILL)}
        >
          Fill
        </button>
      </div>
      
      <div className="tool-divider"></div>
      
      <div className="drawing-tools">
        <button 
          className={tool === ELEMENT_TYPES.RECTANGLE ? 'active' : ''} 
          onClick={() => setTool(ELEMENT_TYPES.RECTANGLE)}
        >
          Rectangle
        </button>
        <button 
          className={tool === ELEMENT_TYPES.CIRCLE ? 'active' : ''} 
          onClick={() => setTool(ELEMENT_TYPES.CIRCLE)}
        >
          Circle
        </button>
        <button 
          className={tool === ELEMENT_TYPES.LINE ? 'active' : ''} 
          onClick={() => setTool(ELEMENT_TYPES.LINE)}
        >
          Line
        </button>
        <button 
          className={tool === ELEMENT_TYPES.TEXT ? 'active' : ''} 
          onClick={() => setTool(ELEMENT_TYPES.TEXT)}
        >
          Text
        </button>
      </div>
        
      <div className="tool-divider"></div>
      
      <div className="color-picker">
        <input 
          type="color" 
          id="color-expanded" 
          value={color} 
          onChange={(e) => setColor(e.target.value)} 
        />
        <label htmlFor="color-expanded">Color</label>
      </div>
      
      <div className="brush-size">
        <label htmlFor="brush-size-expanded">Size:</label>
        <input 
          type="range" 
          id="brush-size-expanded" 
          min="1" 
          max="50" 
          value={brushSize} 
          onChange={(e) => setBrushSize(parseInt(e.target.value))} 
        />
        <span>{brushSize}px</span>
      </div>
      
      {tool === ELEMENT_TYPES.TEXT && (
        <>
          <div className="tool-divider"></div>
          
          <div className="text-controls">
            <label htmlFor="font-size-expanded">Size:</label>
            <input
              type="range"
              id="font-size-expanded"
              min="10"
              max="100"
              value={fontSize}
              onChange={(e) => setFontSize(parseInt(e.target.value))}
            />
            <span>{fontSize}px</span>
            <select 
              value={fontFamily} 
              onChange={(e) => setFontFamily(e.target.value)}
            >
              <option value="Arial">Arial</option>
              <option value="Times New Roman">Times</option>
              <option value="Courier New">Courier</option>
              <option value="Georgia">Georgia</option>
              <option value="Verdana">Verdana</option>
            </select>
          </div>
        </>
      )}
      
      <div className="tool-divider"></div>
      
      <button onClick={handleUploadImage}>
        Upload
      </button>
      
      <button className="toggle-panel" onClick={togglePanel} title="Collapse Toolbar">
        ▲
      </button>
    </div>
  );

  return (
    <div className="canvas-container">
      <div className="editor-header">
        <button className="back-button" onClick={onBack}>
          ← Back to Dashboard
        </button>
        <div className="drawing-title">
          <input 
            type="text" 
            value={drawingName} 
            onChange={handleNameChange}
            placeholder="Untitled Drawing" 
            className="drawing-title-input"
          />
        </div>
        <div className="header-actions">
          <button 
            className="save-button"
            onClick={handleSaveCanvas}
            disabled={isSaving}
          >
            {isSaving ? 'Saving...' : 'Save Drawing'}
          </button>
          <button 
            className="download-button" 
            onClick={handleDownloadCanvas}
          >
            Download SVG
          </button>
        </div>
      </div>
      
      {/* Left sidebar for element properties */}
      <div className={`left-sidebar ${isSidebarOpen ? 'open' : ''}`}>
        {selectedElement && (
          <div className="element-properties">
            <h4>Element Properties</h4>
            
            {selectedElement.type !== ELEMENT_TYPES.ERASER && selectedElement.type !== 'image' && (
              <div className="property-group">
                <label>Color</label>
                <input
                  type="color"
                  value={
                    selectedElement.type === ELEMENT_TYPES.TEXT
                      ? selectedElement.fillColor
                      : selectedElement.strokeColor
                  }
                  onChange={(e) => {
                    setElements(prevElements => prevElements.map(el => {
                      if (el.id === selectedElement.id) {
                        if (el.type === ELEMENT_TYPES.TEXT) {
                          return { ...el, fillColor: e.target.value };
                        } else {
                          return { ...el, strokeColor: e.target.value };
                        }
                      }
                      return el;
                    }));
                  }}
                />
              </div>
            )}
            
            {(selectedElement.type === ELEMENT_TYPES.BRUSH || 
              selectedElement.type === ELEMENT_TYPES.ERASER || 
              selectedElement.type === ELEMENT_TYPES.RECTANGLE || 
              selectedElement.type === ELEMENT_TYPES.CIRCLE || 
              selectedElement.type === ELEMENT_TYPES.LINE) && (
              <div className="property-group">
                <label>Width</label>
                <input
                  type="range"
                  min="1"
                  max="50"
                  value={selectedElement.strokeWidth}
                  onChange={(e) => {
                    setElements(prevElements => prevElements.map(el => {
                      if (el.id === selectedElement.id) {
                        return { ...el, strokeWidth: parseInt(e.target.value) };
                      }
                      return el;
                    }));
                  }}
                />
              </div>
            )}
            
            {selectedElement.type === ELEMENT_TYPES.TEXT && (
              <>
                <div className="property-group">
                  <label>Font Size</label>
                  <input
                    type="range"
                    min="10"
                    max="100"
                    value={selectedElement.fontSize}
                    onChange={(e) => {
                      setElements(prevElements => prevElements.map(el => {
                        if (el.id === selectedElement.id) {
                          return { ...el, fontSize: parseInt(e.target.value) };
                        }
                        return el;
                      }));
                    }}
                  />
                </div>
                <div className="property-group">
                  <label>Font</label>
                  <select
                    value={selectedElement.fontFamily}
                    onChange={(e) => {
                      setElements(prevElements => prevElements.map(el => {
                        if (el.id === selectedElement.id) {
                          return { ...el, fontFamily: e.target.value };
                        }
                        return el;
                      }));
                    }}
                  >
                    <option value="Arial">Arial</option>
                    <option value="Times New Roman">Times</option>
                    <option value="Courier New">Courier</option>
                    <option value="Georgia">Georgia</option>
                    <option value="Verdana">Verdana</option>
                  </select>
                </div>
                <div className="property-group">
                  <label>Text</label>
                  <input
                    type="text"
                    value={selectedElement.text}
                    onChange={(e) => {
                      setElements(prevElements => prevElements.map(el => {
                        if (el.id === selectedElement.id) {
                          return { ...el, text: e.target.value };
                        }
                        return el;
                      }));
                    }}
                  />
                </div>
              </>
            )}
            
            <button
              className="delete-element-btn"
              onClick={() => {
                setElements(prevElements => prevElements.filter(el => el.id !== selectedElement.id));
                setSelectedElement(null);
                setIsSidebarOpen(false);
                saveToHistory(elements.filter(el => el.id !== selectedElement.id));
              }}
            >
              Delete Element
            </button>
          </div>
        )}
      </div>
      
      {/* Tool panel - conditionally render minimized or expanded version */}
      {isPanelExpanded ? renderExpandedToolbar() : renderMinimizedToolbar()}
      
      {/* Bottom Right Toolbar */}
      <div className={`bottom-toolbar ${isBottomPanelExpanded ? 'expanded' : ''}`}>
        <button className="toggle-bottom-panel" onClick={toggleBottomPanel}>
          {isBottomPanelExpanded ? '▼' : '▲'}
        </button>
        
        <div className="history-controls">
          <button onClick={undo} disabled={historyIndex <= 0} title="Undo">
            {isBottomPanelExpanded ? 'Undo' : '↩'}
          </button>
          <button onClick={redo} disabled={historyIndex >= drawingHistory.length - 1} title="Redo">
            {isBottomPanelExpanded ? 'Redo' : '↪'}
          </button>
        </div>
        
        <div className="action-buttons">
          <button onClick={handleClearCanvas} title="Clear Canvas">
            {isBottomPanelExpanded ? 'Clear' : '🗑️'}
          </button>
          <button onClick={handleSaveCanvas} title="Save Drawing">
            {isBottomPanelExpanded ? 'Save' : '💾'}
          </button>
        </div>
      </div>
      
      {isAddingText && (
        <div className="text-input-modal">
          <form onSubmit={handleTextSubmit}>
            <input
              type="text"
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder="Enter your text here"
              autoFocus
            />
            <div className="text-input-buttons">
              <button type="button" onClick={cancelTextInput}>Cancel</button>
              <button type="submit">Add Text</button>
            </div>
          </form>
        </div>
      )}
      
      {/* Loading overlay for image uploads */}
      {isImageLoading && (
        <div className="image-loading-overlay">
          <div className="loading-spinner"></div>
          <p>Loading image...</p>
        </div>
      )}
      
      {/* Saving overlay */}
      {isSaving && (
        <div className="image-loading-overlay">
          <div className="loading-spinner"></div>
          <p>Saving drawing...</p>
        </div>
      )}
      
      {/* Hidden SVG for export */}
      <div style={{ display: 'none' }}>
        <svg ref={svgRef} width="800" height="600"></svg>
      </div>
      
      <canvas
        ref={canvasRef}
        className={`drawing-canvas ${tool} ${isSidebarOpen ? 'sidebar-open' : ''}`}
        onMouseDown={startDrawing}
        onMouseMove={draw}
        onMouseUp={stopDrawing}
        onMouseOut={stopDrawing}
        onTouchStart={startDrawing}
        onTouchMove={draw}
        onTouchEnd={stopDrawing}
      />
      
      {/* Hidden file input for image upload */}
      <input
        type="file"
        ref={fileInputRef}
        style={{ display: 'none' }}
        onChange={handleFileChange}
        accept="image/*"
      />
    </div>
  );
}
export default DrawingEditor;