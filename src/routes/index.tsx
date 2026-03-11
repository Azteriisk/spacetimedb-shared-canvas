import { createFileRoute } from '@tanstack/react-router';
import { useState, useEffect, useRef } from 'react';
import { Show, SignInButton, UserButton, useUser } from '@clerk/tanstack-react-start';
import { tables, reducers } from '../module_bindings';
import {
  useSpacetimeDB,
  useReducer,
  useSpacetimeDBQuery,
} from 'spacetimedb/tanstack';

export const Route = createFileRoute('/')({
  component: App,
});

const TILE_SIZE = 20;

const COLORS = [
  '#FFFFFF', // 0: White
  '#111827', // 1: Black
  '#EF4444', // 2: Red
  '#22C55E', // 3: Green
  '#3B82F6', // 4: Blue
  '#EAB308', // 5: Yellow
  '#06B6D4', // 6: Cyan
  '#D946EF', // 7: Magenta
  '#F97316', // 8: Orange
  '#8B5CF6', // 9: Purple
];

function App() {
  const conn = useSpacetimeDB();
  const { isActive: connected } = conn;
  const { user } = useUser();

  const [tiles] = useSpacetimeDBQuery(tables.tile);
  const setTileColorReducer = useReducer(reducers.setTileColor);

  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [clickedColorIndex, setClickedColorIndex] = useState(1); // default to 1 (black) to allow drawing immediately
  const [camera, setCamera] = useState({ x: 0, y: 0, zoom: 1 });
  const [showInstructions, setShowInstructions] = useState(true);
  const [negativeMode, setNegativeMode] = useState(false);

  const isPanning = useRef(false);
  const isDrawing = useRef(false);
  const lastMousePos = useRef({ x: 0, y: 0 });
  const lastDrawnTile = useRef({ x: Number.MAX_SAFE_INTEGER, y: Number.MAX_SAFE_INTEGER });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) {
        setClickedColorIndex(parseInt(e.key, 10));
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    const timer = setTimeout(() => {
      setShowInstructions(false);
    }, 15000);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      clearTimeout(timer);
    };
  }, []);

  // Add a non-passive event listener to the canvas to reliably prevent default scrolling
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const preventScroll = (e: WheelEvent) => {
      e.preventDefault();
    };

    canvas.addEventListener('wheel', preventScroll, { passive: false });
    return () => {
      canvas.removeEventListener('wheel', preventScroll);
    };
  }, []);

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Background color acts as the grid border
    ctx.fillStyle = '#E5E7EB'; // very light grey for grid lines
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(camera.x, camera.y);
    ctx.scale(camera.zoom, camera.zoom);

    const startX = Math.floor(-camera.x / (TILE_SIZE * camera.zoom));
    const endX = Math.ceil((canvas.width - camera.x) / (TILE_SIZE * camera.zoom));
    const startY = Math.floor(-camera.y / (TILE_SIZE * camera.zoom));
    const endY = Math.ceil((canvas.height - camera.y) / (TILE_SIZE * camera.zoom));

    // Draw all visible white default "empty" tiles
    ctx.fillStyle = COLORS[0];
    ctx.beginPath();
    for (let x = startX; x <= endX; x++) {
      for (let y = startY; y <= endY; y++) {
        ctx.rect(
          x * TILE_SIZE,
          y * TILE_SIZE,
          TILE_SIZE - 1,
          TILE_SIZE - 1
        );
      }
    }
    ctx.fill();

    // Draw painted tiles from SpaceTimeDB
    for (const tile of tiles) {
      if (tile.color === 0) continue;

      // Frustum culling
      if (tile.x >= startX - 1 && tile.x <= endX + 1 && tile.y >= startY - 1 && tile.y <= endY + 1) {
        ctx.fillStyle = COLORS[tile.color];
        ctx.fillRect(
          tile.x * TILE_SIZE,
          tile.y * TILE_SIZE,
          TILE_SIZE - 1,
          TILE_SIZE - 1
        );
      }
    }

    ctx.restore();
  };

  useEffect(() => {
    const handleResize = () => {
      if (canvasRef.current) {
        canvasRef.current.width = window.innerWidth;
        canvasRef.current.height = window.innerHeight;
        draw();
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    // Redraw every time data, camera, or selection changes
    draw();
  }, [tiles, camera, clickedColorIndex]);

  const handlePointerDown = (e: React.PointerEvent) => {
    // Disable text selection during drag
    e.currentTarget.setPointerCapture(e.pointerId);

    // Right (2) or Middle (1) click for panning
    if (e.button === 1 || e.button === 2) {
      isPanning.current = true;
      lastMousePos.current = { x: e.clientX, y: e.clientY };
    } else if (e.button === 0) {
      // Left click to draw
      isDrawing.current = true;
      paintTile(e.clientX, e.clientY);
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (isPanning.current) {
      const dx = e.clientX - lastMousePos.current.x;
      const dy = e.clientY - lastMousePos.current.y;
      setCamera(c => ({ ...c, x: c.x + dx, y: c.y + dy }));
      lastMousePos.current = { x: e.clientX, y: e.clientY };
    } else if (isDrawing.current) {
      paintTile(e.clientX, e.clientY);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    e.currentTarget.releasePointerCapture(e.pointerId);
    isPanning.current = false;
    isDrawing.current = false;
    lastDrawnTile.current = { x: Number.MAX_SAFE_INTEGER, y: Number.MAX_SAFE_INTEGER };
  };

  const paintTile = (clientX: number, clientY: number) => {
    if (!connected) return;

    const tx = Math.floor((clientX - camera.x) / (TILE_SIZE * camera.zoom));
    const ty = Math.floor((clientY - camera.y) / (TILE_SIZE * camera.zoom));

    if (lastDrawnTile.current.x === tx && lastDrawnTile.current.y === ty) {
      return;
    }

    lastDrawnTile.current = { x: tx, y: ty };

    setTileColorReducer({ x: tx, y: ty, color: clickedColorIndex, clerkId: user?.id ?? '' });
  };

  const activeColorIndex = clickedColorIndex;

  const handleWheel = (e: React.WheelEvent) => {
    setCamera(c => {
      const zoomSensitivity = 0.001;
      const newZoom = Math.min(Math.max(0.1, c.zoom - e.deltaY * zoomSensitivity), 5);

      const wx = (e.clientX - c.x) / c.zoom;
      const wy = (e.clientY - c.y) / c.zoom;

      return {
        x: e.clientX - wx * newZoom,
        y: e.clientY - wy * newZoom,
        zoom: newZoom
      };
    });
  };

  return (
    <div style={{
      width: '100vw', height: '100vh', overflow: 'hidden', position: 'relative', background: '#e5e7eb',
      filter: negativeMode ? 'invert(1)' : 'none'
    }}>
      <div style={{ position: 'absolute', top: 16, right: 16, zIndex: 30, pointerEvents: 'auto' }}>
        <Show when="signed-in">
          <UserButton />
        </Show>
        <Show when="signed-out">
          <SignInButton mode="modal">
            <button style={{
              padding: '8px 16px',
              background: '#111827',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'Inter, system-ui, sans-serif'
            }}>Sign In to Paint</button>
          </SignInButton>
        </Show>
      </div>

      <div style={{
        position: 'absolute',
        top: 16,
        left: 16,
        padding: '16px 20px',
        background: 'rgba(255, 255, 255, 0.95)',
        border: '1px solid #e5e7eb',
        borderRadius: 12,
        boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
        zIndex: 10,
        fontFamily: 'Inter, system-ui, sans-serif',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        pointerEvents: 'auto',
      }}>
        <div
          style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}
          onClick={() => setShowInstructions(!showInstructions)}
        >
          <div style={{
            width: 10, height: 10, borderRadius: '50%',
            backgroundColor: connected ? '#22C55E' : '#EF4444',
            boxShadow: connected ? '0 0 8px rgba(34, 197, 94, 0.5)' : '0 0 8px rgba(239, 68, 68, 0.5)',
            filter: negativeMode ? 'invert(1)' : 'none' // Counteract invert for the indicator
          }} />
          <span style={{ fontWeight: 600, color: '#111827', fontSize: '15px', flexGrow: 1 }}>
            {connected ? 'Connected' : 'Connecting...'}
          </span>
          <span style={{ fontSize: '10px', color: '#6B7280', transform: showInstructions ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
            ▼
          </span>
        </div>

        {showInstructions && (
          <div style={{ fontSize: '13px', color: '#6B7280', lineHeight: '1.5' }}>
            <strong>Left Click:</strong> Paint<br />
            <strong>Drag:</strong> Continuous Paint<br />
            <strong>Right/Mid Click:</strong> Pan Canvas<br />
            <strong>Press 0-9:</strong> Select Color<br />
            <strong>Scroll Wheel:</strong> Zoom
          </div>
        )}

        <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
          {COLORS.map((c, i) => {
            const isActive = activeColorIndex === i;
            return (
              <div key={i} onClick={() => setClickedColorIndex(i)} style={{
                width: 28, height: 28,
                backgroundColor: c,
                border: c === '#FFFFFF' ? '1px solid #D1D5DB' : 'none',
                outline: isActive ? '3px solid #3B82F6' : 'none',
                outlineOffset: '2px',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '12px',
                color: (i === 0 || i === 5) ? '#111827' : '#FFFFFF',
                fontWeight: 'bold',
                boxSizing: 'border-box',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                cursor: 'pointer'
              }}>
                {i}
              </div>
            );
          })}
        </div>
      </div>

      <button
        onClick={() => setNegativeMode(n => !n)}
        style={{
          position: 'absolute',
          bottom: 24,
          left: 24,
          width: 48,
          height: 48,
          borderRadius: '50%',
          background: '#FFFFFF',
          color: '#111827',
          border: '1px solid #e5e7eb',
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '24px',
          zIndex: 20
        }}
        title="Toggle Dark Mode"
      >
        {negativeMode ? '☀️' : '🌙'}
      </button>

      <a
        href="https://github.com/clockworklabs/SpacetimeDB"
        target="_blank"
        rel="noreferrer"
        style={{
          position: 'absolute',
          bottom: 24,
          right: 24,
          width: 48,
          height: 48,
          borderRadius: '50%',
          background: '#111827',
          color: '#FFF',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '24px',
          fontWeight: 'bold',
          textDecoration: 'none',
          boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
          zIndex: 20,
          fontFamily: 'Inter, system-ui, sans-serif'
        }}
        title="View on GitHub"
      >
        ?
      </a>

      <canvas
        ref={canvasRef}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onContextMenu={e => e.preventDefault()}
        style={{ display: 'block', touchAction: 'none', cursor: 'crosshair', width: '100%', height: '100%' }}
      />
    </div>
  );
}

