import { useState } from 'react';
import Dashboard from './pages/Dashboard';
import DrawingEditor from './pages/DrawingEditor';
import './App.css';

function App() {
  const [view, setView] = useState('dashboard'); // 'dashboard' or 'editor'
  const [currentDrawing, setCurrentDrawing] = useState(null);

  const handleOpenDrawing = (drawing) => {
    setCurrentDrawing(drawing);
    setView('editor');
  };

  const handleNewDrawing = (drawing) => {
    setCurrentDrawing(drawing);
    setView('editor');
  };

  const handleBackToDashboard = () => {
    setView('dashboard');
  };

  return (
    <div className="app">
      {view === 'dashboard' ? (
        <Dashboard 
          onOpenDrawing={handleOpenDrawing}
          onNewDrawing={handleNewDrawing}
        />
      ) : (
        <DrawingEditor 
          onBack={handleBackToDashboard}
          currentDrawing={currentDrawing}
        />
      )}
    </div>
  );
}

export default App;
