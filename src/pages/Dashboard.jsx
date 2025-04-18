import { useState, useEffect } from 'react';
import './Dashboard.css';

function Dashboard({ onOpenDrawing, onNewDrawing }) {
  const [drawings, setDrawings] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Load saved drawings from storage when component mounts
    loadSavedDrawings();
  }, []);

  const loadSavedDrawings = async () => {
    try {
      setIsLoading(true);
      
      // Check if the browser supports the File System Access API
      if ('storage' in navigator && 'getDirectory' in navigator.storage) {
        const root = await navigator.storage.getDirectory();
        const drawingsDir = await root.getDirectoryHandle('drawings', { create: true });
        
        // Get all files in the drawings directory
        const entries = [];
        const fileHandles = {};
        
        // First pass: collect all file handles
        for await (const [name, handle] of drawingsDir.entries()) {
          if (handle.kind === 'file') {
            fileHandles[name] = handle;
          }
        }
        
        // Second pass: match drawings with their thumbnails and JSON data
        const processedNames = new Set();
        
        for (const [name, handle] of Object.entries(fileHandles)) {
          // Skip if already processed or if it's a thumbnail or JSON
          if (processedNames.has(name) || name.includes('-thumb') || name.endsWith('.json')) {
            continue;
          }
          
          try {
            // Read file metadata
            const file = await handle.getFile();
            const baseName = name.replace(/\.(svg|png)$/, '');
            processedNames.add(name);
            
            // Look for thumbnail
            const thumbName = `${baseName}-thumb.jpg`;
            const thumbHandle = fileHandles[thumbName];
            let thumbnail;
            
            if (thumbHandle) {
              const thumbFile = await thumbHandle.getFile();
              thumbnail = URL.createObjectURL(thumbFile);
              processedNames.add(thumbName);
            }
            
            // Look for JSON data file (contains vector elements)
            const jsonName = `${baseName}.json`;
            const jsonHandle = fileHandles[jsonName];
            let vectorData;
            
            if (jsonHandle) {
              processedNames.add(jsonName);
              
              // We'll only load the vector data when the drawing is opened
              // This is just to remember that we have the data
              vectorData = true;
            }
            
            // Add the entry
            entries.push({
              name,
              handle,
              jsonHandle: jsonHandle,
              lastModified: file.lastModified,
              thumbnail: thumbnail || URL.createObjectURL(file),
              created: new Date(file.lastModified).toLocaleDateString(),
              vectorBased: name.endsWith('.svg') || vectorData
            });
          } catch (err) {
            console.error(`Error processing file ${name}:`, err);
          }
        }
        
        // Sort by last modified date (newest first)
        entries.sort((a, b) => b.lastModified - a.lastModified);
        setDrawings(entries);
      } else {
        // Fallback to localStorage for browsers that don't support File System Access API
        const savedDrawings = localStorage.getItem('drawings') ? 
          JSON.parse(localStorage.getItem('drawings')) : [];
        
        // Add vectorBased property if it doesn't exist
        const processedDrawings = savedDrawings.map(drawing => ({
          ...drawing,
          vectorBased: drawing.vectorData || drawing.svg ? true : false
        }));
        
        setDrawings(processedDrawings);
      }
    } catch (err) {
      console.error('Failed to load drawings:', err);
      // Fallback to empty list
      setDrawings([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateNewDrawing = () => {
    onNewDrawing();
  };

  const handleOpenDrawing = (drawing) => {
    onOpenDrawing(drawing);
  };

  const handleDeleteDrawing = async (event, drawing) => {
    event.stopPropagation(); // Prevent opening the drawing when clicking delete
    
    if (!window.confirm(`Are you sure you want to delete "${drawing.name}"?`)) {
      return;
    }
    
    try {
      if ('storage' in navigator && drawing.handle) {
        // File System Access API approach
        const root = await navigator.storage.getDirectory();
        const drawingsDir = await root.getDirectoryHandle('drawings', { create: true });
        
        // Get the base name without extension
        const baseName = drawing.name.replace(/\.(svg|png)$/, '');
        
        // Delete main file
        await drawingsDir.removeEntry(drawing.name);
        
        // Delete thumbnail if it exists
        try {
          await drawingsDir.removeEntry(`${baseName}-thumb.jpg`);
        } catch (e) {
          // Thumbnail might not exist, that's okay
          console.log(e)
        }
        
        // Delete JSON data if it exists
        try {
          await drawingsDir.removeEntry(`${baseName}.json`);
        } catch (e) {
          // JSON might not exist, that's okay
          console.log(e)
        }
        
        // Clean up the thumbnail URL
        URL.revokeObjectURL(drawing.thumbnail);
      } else {
        // Fallback to localStorage
        const savedDrawings = JSON.parse(localStorage.getItem('drawings') || '[]');
        const updatedDrawings = savedDrawings.filter(d => d.id !== drawing.id);
        localStorage.setItem('drawings', JSON.stringify(updatedDrawings));
      }
      
      // Refresh the list
      loadSavedDrawings();
    } catch (err) {
      console.error('Failed to delete drawing:', err);
      alert('Failed to delete drawing. Please try again.');
    }
  };

  return (
    <div className="dashboard-container">
      <h1>Canvas Drawings</h1>
      
      <div className="dashboard-actions">
        <button className="new-drawing-btn" onClick={handleCreateNewDrawing}>
          Create New Drawing
        </button>
      </div>
      
      {isLoading ? (
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Loading your drawings...</p>
        </div>
      ) : (
        <div className="drawings-grid">
          {drawings.length === 0 ? (
            <div className="no-drawings">
              <p>You don't have any saved drawings yet.</p>
              <p>Click "Create New Drawing" to get started!</p>
            </div>
          ) : (
            drawings.map((drawing, index) => (
              <div 
                key={drawing.name || index}
                className="drawing-card"
                onClick={() => handleOpenDrawing(drawing)}
              >
                <div className="drawing-thumbnail">
                  {drawing.thumbnail ? (
                    <img src={drawing.thumbnail} alt={drawing.name} />
                  ) : (
                    <div className="placeholder-thumbnail">No Preview</div>
                  )}
                  {drawing.vectorBased && (
                    <span className="vector-badge" title="Vector Drawing">SVG</span>
                  )}
                </div>
                <div className="drawing-info">
                  <h3>{drawing.name || `Drawing ${index + 1}`}</h3>
                  <p>Created: {drawing.created || 'Unknown date'}</p>
                  <button 
                    className="delete-drawing-btn"
                    onClick={(e) => handleDeleteDrawing(e, drawing)}
                    title="Delete drawing"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default Dashboard;