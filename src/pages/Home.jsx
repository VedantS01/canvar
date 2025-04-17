import { useState, useEffect, useRef } from 'react';
import './Home.css';

function Home() {
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState('#000000');
  const [brushSize, setBrushSize] = useState(5);
  const [canvasContext, setCanvasContext] = useState(null);
  const [tool, setTool] = useState('brush');
  const [drawingHistory, setDrawingHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [isPanelExpanded, setIsPanelExpanded] = useState(false);
  const [isBottomPanelExpanded, setIsBottomPanelExpanded] = useState(false);
  
  // Shape drawing state
  const [startPosition, setStartPosition] = useState({ x: 0, y: 0 });
  
  // Text tool state
  const [textInput, setTextInput] = useState('');
  const [fontSize, setFontSize] = useState(20);
  const [fontFamily, setFontFamily] = useState('Arial');
  const [isAddingText, setIsAddingText] = useState(false);
  const [textPosition, setTextPosition] = useState({ x: 0, y: 0 });

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
      
      // Save initial canvas state for history
      saveCanvasState();
    }
  }, []);

  const saveCanvasState = () => {
    if (!canvasRef.current) return;
    
    // Save canvas state to history
    const canvasImage = canvasRef.current.toDataURL();
    
    // If we're not at the end of the history, remove future states
    if (historyIndex < drawingHistory.length - 1) {
      setDrawingHistory(drawingHistory.slice(0, historyIndex + 1));
    }
    
    setDrawingHistory([...drawingHistory, canvasImage]);
    setHistoryIndex(prevIndex => prevIndex + 1);
  };

  const undo = () => {
    if (historyIndex > 0) {
      setHistoryIndex(prevIndex => prevIndex - 1);
      
      const img = new Image();
      img.src = drawingHistory[historyIndex - 1];
      img.onload = () => {
        canvasContext.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        canvasContext.drawImage(img, 0, 0);
      };
    }
  };

  const redo = () => {
    if (historyIndex < drawingHistory.length - 1) {
      setHistoryIndex(prevIndex => prevIndex + 1);
      
      const img = new Image();
      img.src = drawingHistory[historyIndex + 1];
      img.onload = () => {
        canvasContext.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        canvasContext.drawImage(img, 0, 0);
      };
    }
  };

  const startDrawing = (e) => {
    const { offsetX, offsetY } = getCoordinates(e);
    
    // For text tool, just set the position and activate text input
    if (tool === 'text') {
      setTextPosition({ x: offsetX, y: offsetY });
      setIsAddingText(true);
      return;
    }
    
    // For fill tool, execute fill at click point and return
    if (tool === 'fill') {
      floodFill(offsetX, offsetY, color);
      saveCanvasState();
      return;
    }

    // For all other tools that involve dragging
    canvasContext.beginPath();
    canvasContext.moveTo(offsetX, offsetY);
    setStartPosition({ x: offsetX, y: offsetY });
    setIsDrawing(true);
  };

  const draw = (e) => {
    if (!isDrawing) return;
    
    const { offsetX, offsetY } = getCoordinates(e);
    
    // Create a copy of the canvas for shape preview
    const canvas = canvasRef.current;
    
    // Handle different tools
    switch (tool) {
      case 'brush':
        canvasContext.lineTo(offsetX, offsetY);
        canvasContext.strokeStyle = color;
        canvasContext.lineWidth = brushSize;
        canvasContext.stroke();
        break;
        
      case 'eraser':
        canvasContext.lineTo(offsetX, offsetY);
        canvasContext.strokeStyle = '#FFFFFF'; // White for eraser
        canvasContext.lineWidth = brushSize;
        canvasContext.stroke();
        break;
        
      case 'rectangle':
        // For shapes, we need to clear and redraw on each move for preview
        
        // Restore previous state before drawing the preview
        if (drawingHistory.length > 0) {
          const img = new Image();
          img.src = drawingHistory[historyIndex];
          img.onload = () => {
            canvasContext.clearRect(0, 0, canvas.width, canvas.height);
            canvasContext.drawImage(img, 0, 0);
            
            // Draw rectangle preview
            canvasContext.beginPath();
            canvasContext.rect(startPosition.x, startPosition.y, offsetX - startPosition.x, offsetY - startPosition.y);
            canvasContext.strokeStyle = color;
            canvasContext.lineWidth = brushSize;
            canvasContext.stroke();
          };
        }
        break;
        
      case 'circle':
        // Calculate radius based on distance
        
        // Restore previous state before drawing the preview
        if (drawingHistory.length > 0) {
          const img = new Image();
          img.src = drawingHistory[historyIndex];
          img.onload = () => {
            canvasContext.clearRect(0, 0, canvas.width, canvas.height);
            canvasContext.drawImage(img, 0, 0);
            
            // Draw circle preview
            canvasContext.beginPath();
            canvasContext.arc(startPosition.x, startPosition.y, Math.sqrt(
                Math.pow(offsetX - startPosition.x, 2) + 
                Math.pow(offsetY - startPosition.y, 2)
              ), 0, Math.PI * 2);
            canvasContext.strokeStyle = color;
            canvasContext.lineWidth = brushSize;
            canvasContext.stroke();
          };
        }
        break;
        
      case 'line':
        // Restore previous state before drawing the preview
        if (drawingHistory.length > 0) {
          const img = new Image();
          img.src = drawingHistory[historyIndex];
          img.onload = () => {
            canvasContext.clearRect(0, 0, canvas.width, canvas.height);
            canvasContext.drawImage(img, 0, 0);
            
            // Draw line preview
            canvasContext.beginPath();
            canvasContext.moveTo(startPosition.x, startPosition.y);
            canvasContext.lineTo(offsetX, offsetY);
            canvasContext.strokeStyle = color;
            canvasContext.lineWidth = brushSize;
            canvasContext.stroke();
          };
        }
        break;
        
      default:
        break;
    }
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    
    // For shape tools, finalize the drawing
    if (['rectangle', 'circle', 'line'].includes(tool)) {
      // The final shape is already drawn in the draw function
      saveCanvasState();
    } else if (tool === 'brush' || tool === 'eraser') {
      canvasContext?.closePath();
      saveCanvasState();
    }
    
    setIsDrawing(false);
  };

  // Text handling functions
  const handleTextSubmit = (e) => {
    e.preventDefault();
    
    if (textInput && isAddingText) {
      canvasContext.font = `${fontSize}px ${fontFamily}`;
      canvasContext.fillStyle = color;
      canvasContext.fillText(textInput, textPosition.x, textPosition.y);
      
      setTextInput('');
      setIsAddingText(false);
      saveCanvasState();
    }
  };

  const cancelTextInput = () => {
    setTextInput('');
    setIsAddingText(false);
  };

  // Flood fill algorithm for the fill bucket tool
  const floodFill = (startX, startY, fillColor) => {
    const canvas = canvasRef.current;
    const ctx = canvasContext;
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    
    // Get the color at the starting point
    const startPos = (startY * canvas.width + startX) * 4;
    const startR = data[startPos];
    const startG = data[startPos + 1];
    const startB = data[startPos + 2];
    const startA = data[startPos + 3];
    
    // Convert fill color from hex to RGB
    const fillR = parseInt(fillColor.slice(1, 3), 16);
    const fillG = parseInt(fillColor.slice(3, 5), 16);
    const fillB = parseInt(fillColor.slice(5, 7), 16);
    
    // Check if we're already at the target color
    if (startR === fillR && startG === fillG && startB === fillB) {
      return;
    }
    
    // Stack for flood fill algorithm
    const pixelsToCheck = [{x: startX, y: startY}];
    const visited = new Set();
    
    while (pixelsToCheck.length > 0) {
      const {x, y} = pixelsToCheck.pop();
      const pos = (y * canvas.width + x) * 4;
      
      // Check if this pixel is within bounds and has the starting color
      if (
        x < 0 || y < 0 || x >= canvas.width || y >= canvas.height ||
        visited.has(`${x},${y}`) ||
        Math.abs(data[pos] - startR) > 10 ||
        Math.abs(data[pos + 1] - startG) > 10 ||
        Math.abs(data[pos + 2] - startB) > 10 ||
        Math.abs(data[pos + 3] - startA) > 10
      ) {
        continue;
      }
      
      // Mark as visited
      visited.add(`${x},${y}`);
      
      // Set the color
      data[pos] = fillR;
      data[pos + 1] = fillG;
      data[pos + 2] = fillB;
      data[pos + 3] = 255; // Full alpha
      
      // Add adjacent pixels to check
      pixelsToCheck.push({x: x + 1, y: y});
      pixelsToCheck.push({x: x - 1, y: y});
      pixelsToCheck.push({x: x, y: y + 1});
      pixelsToCheck.push({x: x, y: y - 1});
    }
    
    // Put the modified image data back to the canvas
    ctx.putImageData(imageData, 0, 0);
  };

  // Handle touch and mouse events
  const getCoordinates = (e) => {
    if (e.type.includes('touch')) {
      const touch = e.touches[0];
      const rect = canvasRef.current.getBoundingClientRect();
      return {
        offsetX: touch.clientX - rect.left,
        offsetY: touch.clientY - rect.top
      };
    } else {
      return {
        offsetX: e.nativeEvent.offsetX,
        offsetY: e.nativeEvent.offsetY
      };
    }
  };

  const handleClearCanvas = () => {
    if (canvasContext && canvasRef.current) {
      canvasContext.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      saveCanvasState();
    }
  };

  const handleSaveCanvas = () => {
    if (canvasRef.current) {
      // Create a temporary link to download the image
      const link = document.createElement('a');
      link.download = `drawing-${new Date().toISOString().slice(0, 10)}.png`;
      link.href = canvasRef.current.toDataURL('image/png');
      link.click();
    }
  };

  const togglePanel = () => {
    setIsPanelExpanded(!isPanelExpanded);
  };
  
  const toggleBottomPanel = () => {
    setIsBottomPanelExpanded(!isBottomPanelExpanded);
  };

  return (
    <div className="canvas-container">
      <h1>Canvas Drawing App</h1>
      
      <div className={`tool-panel ${isPanelExpanded ? 'expanded' : ''}`}>
        <button className="toggle-panel" onClick={togglePanel}>
          {isPanelExpanded ? '◀' : '▶'}
        </button>
        
        <div className="drawing-tools">
          <button 
            className={tool === 'brush' ? 'active' : ''} 
            onClick={() => setTool('brush')}
            title="Brush"
          >
            {isPanelExpanded ? 'Brush' : '🖌️'}
          </button>
          <button 
            className={tool === 'eraser' ? 'active' : ''} 
            onClick={() => setTool('eraser')}
            title="Eraser"
          >
            {isPanelExpanded ? 'Eraser' : '🧽'}
          </button>
          <button 
            className={tool === 'fill' ? 'active' : ''} 
            onClick={() => setTool('fill')}
            title="Fill"
          >
            {isPanelExpanded ? 'Fill' : '🪣'}
          </button>
          <button 
            className={tool === 'text' ? 'active' : ''} 
            onClick={() => setTool('text')}
            title="Text"
          >
            {isPanelExpanded ? 'Text' : 'T'}
          </button>
          <button 
            className={tool === 'rectangle' ? 'active' : ''} 
            onClick={() => setTool('rectangle')}
            title="Rectangle"
          >
            {isPanelExpanded ? 'Rectangle' : '□'}
          </button>
          <button 
            className={tool === 'circle' ? 'active' : ''} 
            onClick={() => setTool('circle')}
            title="Circle"
          >
            {isPanelExpanded ? 'Circle' : '○'}
          </button>
          <button 
            className={tool === 'line' ? 'active' : ''} 
            onClick={() => setTool('line')}
            title="Line"
          >
            {isPanelExpanded ? 'Line' : '╱'}
          </button>
        </div>
        
        <div className="color-picker">
          <input 
            type="color" 
            id="color" 
            value={color} 
            onChange={(e) => setColor(e.target.value)} 
            title="Color Picker"
          />
          {isPanelExpanded && <label htmlFor="color">Color</label>}
        </div>
        
        <div className="brush-size">
          {isPanelExpanded && <label htmlFor="brush-size">Size: {brushSize}px</label>}
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
        
        {tool === 'text' && (
          <div className="text-controls">
            {isPanelExpanded && <label htmlFor="font-size">Size: {fontSize}px</label>}
            <input
              type="range"
              id="font-size"
              min="10"
              max="100"
              value={fontSize}
              onChange={(e) => setFontSize(parseInt(e.target.value))}
              title={`Font Size: ${fontSize}px`}
            />
            <select 
              value={fontFamily} 
              onChange={(e) => setFontFamily(e.target.value)}
              title="Font Family"
            >
              <option value="Arial">Arial</option>
              <option value="Times New Roman">Times</option>
              <option value="Courier New">Courier</option>
              <option value="Georgia">Georgia</option>
              <option value="Verdana">Verdana</option>
            </select>
          </div>
        )}
      </div>
      
      {/* New Bottom Right Toolbar */}
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
          <button onClick={handleSaveCanvas} title="Save as PNG">
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
              placeholder="Enter text..."
              autoFocus
            />
            <div className="text-input-buttons">
              <button type="submit">Add Text</button>
              <button type="button" onClick={cancelTextInput}>Cancel</button>
            </div>
          </form>
        </div>
      )}
      
      <canvas
        ref={canvasRef}
        className={`drawing-canvas ${tool === 'brush' ? 'brush' : ''} ${tool === 'eraser' ? 'eraser' : ''} ${tool === 'fill' ? 'fill' : ''} ${tool === 'text' ? 'text' : ''} ${['rectangle', 'circle', 'line'].includes(tool) ? 'shape' : ''}`}
        onMouseDown={startDrawing}
        onMouseMove={draw}
        onMouseUp={stopDrawing}
        onMouseOut={stopDrawing}
        onTouchStart={startDrawing}
        onTouchMove={draw}
        onTouchEnd={stopDrawing}
      />
    </div>
  );
}

export default Home;

