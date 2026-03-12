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
  const [snapshots] = useSpacetimeDBQuery(tables.snapshot);
  const setTileColorReducer = useReducer(reducers.setTileColor);
  const saveSnapshotReducer = useReducer(reducers.saveSnapshot);
  const loadSnapshotReducer = useReducer(reducers.loadSnapshot);
  const wipeCanvasReducer = useReducer(reducers.wipeCanvas);
  const deleteSnapshotReducer = useReducer(reducers.deleteSnapshot);

  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [clickedColorIndex, setClickedColorIndex] = useState(1); // default to 1 (black) to allow drawing immediately
  const [camera, setCamera] = useState({ x: 0, y: 0, zoom: 1 });
  const [negativeMode, setNegativeMode] = useState(false);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [snapshotName, setSnapshotName] = useState('');

  const isAdmin = user?.id && import.meta.env.VITE_ADMIN_CLERK_ID && user.id === import.meta.env.VITE_ADMIN_CLERK_ID;

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

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
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

  const animationFrameRef = useRef<number>(0);

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear everything with the grid border color
    ctx.fillStyle = negativeMode ? '#374151' : '#E5E7EB';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(camera.x, camera.y);
    ctx.scale(camera.zoom, camera.zoom);

    // Calculate visible bounds in world coordinates
    const startX = Math.floor(-camera.x / (TILE_SIZE * camera.zoom));
    const endX = Math.ceil((canvas.width - camera.x) / (TILE_SIZE * camera.zoom));
    const startY = Math.floor(-camera.y / (TILE_SIZE * camera.zoom));
    const endY = Math.ceil((canvas.height - camera.y) / (TILE_SIZE * camera.zoom));
    // Fast Path: Draw one massive background rectangle for the active area to serve as the default tile color
    // We only draw individual grid lines by leaving a 1px gap, so filling the background works.
    ctx.fillStyle = negativeMode ? '#1e293b' : COLORS[0]; // In negative mode, default (0) background is very dark grey.

    // We'll draw the solid background color first
    ctx.fillStyle = negativeMode ? '#1e293b' : COLORS[0]; // In negative mode, default (0) background is very dark grey.
    ctx.fillRect(startX * TILE_SIZE, startY * TILE_SIZE, (endX - startX + 1) * TILE_SIZE, (endY - startY + 1) * TILE_SIZE);

    // Draw painted tiles from SpaceTimeDB
    for (const tile of tiles) {
      if (tile.color === 0) continue; // Default white is handled above

      // Frustum culling
      if (tile.x >= startX - 1 && tile.x <= endX + 1 && tile.y >= startY - 1 && tile.y <= endY + 1) {
        // Color 0 is already handled above (as white in normal, true black in dark mode)
        // For color 1 (Black), we want it to map to pure White in dark mode so it stands out against the black background.
        let tileColor = COLORS[tile.color];
        if (negativeMode && tile.color === 1) tileColor = '#FFFFFF';
        
        ctx.fillStyle = tileColor;
        // Draw the tile full size (we will draw grid lines OVER them later)
        ctx.fillRect(
          tile.x * TILE_SIZE,
          tile.y * TILE_SIZE,
          TILE_SIZE,
          TILE_SIZE
        );
      }
    }

    // Now draw the grid lines on top, but only if zoomed in enough
    if (camera.zoom > 0.3) {
      // The grid line color
      ctx.strokeStyle = negativeMode ? '#374151' : '#E5E7EB';
      ctx.lineWidth = 1 / camera.zoom; // Keep lines 1px wide regardless of zoom
      ctx.beginPath();
      
      // Vertical lines
      for (let x = startX; x <= endX + 1; x++) {
        ctx.moveTo(x * TILE_SIZE, startY * TILE_SIZE);
        ctx.lineTo(x * TILE_SIZE, (endY + 1) * TILE_SIZE);
      }
      
      // Horizontal lines
      for (let y = startY; y <= endY + 1; y++) {
        ctx.moveTo(startX * TILE_SIZE, y * TILE_SIZE);
        ctx.lineTo((endX + 1) * TILE_SIZE, y * TILE_SIZE);
      }
      
      ctx.stroke();
    }

    ctx.restore();
  };

  const scheduleDraw = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    animationFrameRef.current = requestAnimationFrame(draw);
  };

  useEffect(() => {
    const handleResize = () => {
      if (canvasRef.current) {
        canvasRef.current.width = window.innerWidth;
        canvasRef.current.height = window.innerHeight;
        scheduleDraw();
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    // Redraw every time data, camera, or selection changes
    scheduleDraw();
  }, [tiles, camera, clickedColorIndex, negativeMode]);

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
      width: '100vw', height: '100vh', overflow: 'hidden', position: 'relative',
      background: negativeMode ? '#111827' : '#e5e7eb'
    }}>

      {/* Top Left: Logo / Status */}
      <div style={{
        position: 'absolute', top: 24, left: 24, zIndex: 30, pointerEvents: 'auto',
        display: 'flex', alignItems: 'center', gap: 12,
        background: negativeMode ? 'rgba(31, 41, 55, 0.95)' : 'rgba(255, 255, 255, 0.95)',
        backdropFilter: 'blur(12px)',
        padding: '12px 20px', borderRadius: 16, border: negativeMode ? '1px solid rgba(55, 65, 81, 0.5)' : '1px solid rgba(229, 231, 235, 0.5)',
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
        fontFamily: 'Inter, system-ui, sans-serif'
      }}>
        <div style={{
          width: 12, height: 12, borderRadius: '50%',
          background: connected ? '#22C55E' : '#EF4444',
          boxShadow: connected ? '0 0 12px rgba(34,197,94,0.6)' : '0 0 12px rgba(239,68,68,0.6)'
        }} />
        <span style={{ fontWeight: 600, color: negativeMode ? '#F9FAFB' : '#111827', fontSize: '14px', letterSpacing: '0.02em' }}>
          {connected ? 'SpaceTimeDB Connected' : 'Connecting...'}
        </span>
      </div>

      {/* Top Left: Admin Panel — only visible to the admin */}
      <Show when="signed-in">
        {isAdmin && (
          <div style={{
            position: 'absolute', top: 76, left: 24, zIndex: 30, pointerEvents: 'auto',
            fontFamily: 'Inter, system-ui, sans-serif',
          }}>
            {/* Admin Toggle Button */}
        <button
          onClick={() => setShowAdminPanel(p => !p)}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: negativeMode ? 'rgba(31, 41, 55, 0.95)' : 'rgba(255, 255, 255, 0.95)',
            backdropFilter: 'blur(12px)',
            padding: '8px 14px', borderRadius: 12,
            border: negativeMode ? '1px solid rgba(55, 65, 81, 0.5)' : '1px solid rgba(229, 231, 235, 0.5)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.08)', cursor: 'pointer',
            color: negativeMode ? '#D1D5DB' : '#374151', fontSize: 13, fontWeight: 600,
          }}
          title="Admin Controls"
        >
          <span>⚙️</span>
          <span>Admin</span>
        </button>

        {/* Admin Flyout */}
        {showAdminPanel && (
          <div style={{
            marginTop: 8,
            background: negativeMode ? 'rgba(17, 24, 39, 0.97)' : 'rgba(255, 255, 255, 0.97)',
            backdropFilter: 'blur(16px)',
            borderRadius: 16,
            border: negativeMode ? '1px solid rgba(55, 65, 81, 0.6)' : '1px solid rgba(229, 231, 235, 0.6)',
            boxShadow: '0 20px 40px rgba(0,0,0,0.15)',
            padding: '16px',
            minWidth: 240,
          }}>
            <div style={{ color: negativeMode ? '#9CA3AF' : '#6B7280', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>Canvas Controls</div>

            {/* Save Snapshot */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <input
                value={snapshotName}
                onChange={e => setSnapshotName(e.target.value)}
                placeholder="Snapshot name…"
                style={{
                  flex: 1, padding: '8px 10px', borderRadius: 8, fontSize: 13,
                  background: negativeMode ? '#1F2937' : '#F9FAFB',
                  border: negativeMode ? '1px solid #374151' : '1px solid #E5E7EB',
                  color: negativeMode ? '#F9FAFB' : '#111827', outline: 'none',
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter' && snapshotName.trim()) {
                    saveSnapshotReducer({ name: snapshotName.trim() });
                    setSnapshotName('');
                  }
                }}
              />
              <button
                onClick={async () => {
                  if (!snapshotName.trim()) return;
                  try {
                    console.log("Calling saveSnapshot with:", { name: snapshotName.trim() });
                    await saveSnapshotReducer({ name: snapshotName.trim() });
                    console.log("Save snapshot SUCCESS");
                    setSnapshotName('');
                  } catch (err) {
                    console.error("Save snapshot failed:", err);
                  }
                }}
                disabled={!snapshotName.trim()}
                style={{
                  padding: '8px 12px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                  background: snapshotName.trim() ? '#3B82F6' : (negativeMode ? '#374151' : '#E5E7EB'),
                  color: snapshotName.trim() ? '#FFFFFF' : (negativeMode ? '#6B7280' : '#9CA3AF'),
                  border: 'none', cursor: snapshotName.trim() ? 'pointer' : 'not-allowed',
                }}
                title="Save Snapshot"
              >💾 Save</button>
            </div>

            {/* Wipe Canvas */}
            <button
              onClick={async () => {
                if (user?.id && confirm('Wipe the entire canvas? This cannot be undone.')) {
                  try {
                    console.log("Calling wipeCanvas with:", { clerkId: user.id });
                    await wipeCanvasReducer({ clerkId: user.id });
                    console.log("Wipe canvas SUCCESS");
                  } catch (err) {
                    console.error("Wipe canvas failed:", err);
                  }
                }
              }}
              style={{
                width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                background: '#EF4444', color: '#FFFFFF', border: 'none', cursor: 'pointer',
                marginBottom: 12,
              }}
            >🗑️ Wipe Canvas</button>

            {/* Snapshots List */}
            {snapshots.length > 0 && (
              <div>
                <div style={{ color: negativeMode ? '#9CA3AF' : '#6B7280', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>Snapshots</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 200, overflowY: 'auto' }}>
                  {[...snapshots].sort((a, b) => Number(b.id - a.id)).map(snap => (
                    <div key={String(snap.id)} style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '6px 8px', borderRadius: 8,
                      background: negativeMode ? '#1F2937' : '#F3F4F6',
                    }}>
                      <span style={{ flex: 1, fontSize: 13, color: negativeMode ? '#E5E7EB' : '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {snap.name}
                      </span>
                      <button
                        onClick={async () => {
                          if (user?.id && confirm(`Load "${snap.name}"? Current canvas will be replaced.`)) {
                            try {
                              console.log("Calling loadSnapshot with:", { snapshotId: snap.id, clerkId: user.id });
                              await loadSnapshotReducer({ snapshotId: snap.id, clerkId: user.id });
                              console.log("Load snapshot SUCCESS");
                            } catch (err) {
                              console.error("Load snapshot failed:", err);
                            }
                          }
                        }}
                        style={{ padding: '3px 8px', borderRadius: 6, fontSize: 12, fontWeight: 600, background: '#3B82F6', color: '#FFF', border: 'none', cursor: 'pointer' }}
                      >Load</button>
                      <button
                        onClick={async () => {
                          if (user?.id && confirm(`Delete snapshot "${snap.name}"?`)) {
                            try {
                              console.log("Calling deleteSnapshot with:", { snapshotId: snap.id, clerkId: user.id });
                              await deleteSnapshotReducer({ snapshotId: snap.id, clerkId: user.id });
                              console.log("Delete snapshot SUCCESS");
                            } catch (err) {
                              console.error("Delete snapshot failed:", err);
                            }
                          }
                        }}
                        style={{ padding: '3px 8px', borderRadius: 6, fontSize: 12, fontWeight: 600, background: '#EF4444', color: '#FFF', border: 'none', cursor: 'pointer' }}
                      >✕</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {snapshots.length === 0 && (
              <div style={{ color: negativeMode ? '#6B7280' : '#9CA3AF', fontSize: 12, textAlign: 'center', padding: '8px 0' }}>No snapshots saved yet</div>
            )}
          </div>
        )}
      </div>
      )}
      </Show>

      {/* Top Right: Auth Profile */}
      <div style={{
        position: 'absolute', top: 24, right: 24, zIndex: 30, pointerEvents: 'auto',
        display: 'flex', alignItems: 'center'
      }}>
        <Show when="signed-in">
          <div style={{
            background: negativeMode ? 'rgba(31, 41, 55, 0.95)' : 'rgba(255, 255, 255, 0.95)',
            backdropFilter: 'blur(12px)',
            borderRadius: '50%', padding: '6px', border: negativeMode ? '1px solid rgba(55, 65, 81, 0.5)' : '1px solid rgba(229, 231, 235, 0.5)',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <UserButton />
          </div>
        </Show>
        <Show when="signed-out">
          <SignInButton mode="modal">
            <button style={{
              background: negativeMode ? 'rgba(31, 41, 55, 0.95)' : 'rgba(255, 255, 255, 0.95)',
              backdropFilter: 'blur(12px)',
              borderRadius: '50%', padding: '12px', border: negativeMode ? '1px solid rgba(55, 65, 81, 0.5)' : '1px solid rgba(229, 231, 235, 0.5)',
              boxShadow: '0 4px 15px rgba(0,0,0,0.1)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }} title="Sign In using Clerk">
              <svg style={{ width: 24, height: 24, color: negativeMode ? '#D1D5DB' : '#9CA3AF' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </button>
          </SignInButton>
        </Show>
      </div>

      {/* Bottom Center: Floating Toolbar */}
      <div style={{
        position: 'absolute', bottom: 32, left: '50%', transform: 'translateX(-50%)', zIndex: 30, pointerEvents: 'auto',
        display: 'flex', alignItems: 'center', gap: 16,
        background: negativeMode ? 'rgba(31, 41, 55, 0.95)' : 'rgba(255, 255, 255, 0.95)',
        backdropFilter: 'blur(16px)',
        padding: '16px 24px', borderRadius: 32, border: negativeMode ? '1px solid rgba(55, 65, 81, 0.5)' : '1px solid rgba(229, 231, 235, 0.5)',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
        fontFamily: 'Inter, system-ui, sans-serif'
      }}>

        {/* Dark Mode Toggle */}
        <button
          onClick={() => setNegativeMode(n => !n)}
          style={{
            width: 48, height: 48, borderRadius: 16, background: negativeMode ? '#374151' : '#F3F4F6', color: negativeMode ? '#F9FAFB' : '#111827',
            border: negativeMode ? '1px solid #4B5563' : '1px solid #E5E7EB', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 24, cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 2px 5px rgba(0,0,0,0.05)'
          }}
          title="Toggle Dark Mode"
        >
          {negativeMode ? '☀️' : '🌙'}
        </button>

        <div style={{ width: 1, height: 40, background: negativeMode ? '#4B5563' : '#E5E7EB', margin: '0 4px' }} /> {/* Divider */}

        {/* Colors */}
        <div style={{ display: 'flex', gap: 8 }}>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map((i) => {
            const c = COLORS[i];
            const isActive = activeColorIndex === i;
            // In dark mode: 0 (White) maps to very dark grey (#1e293b) to match background, 1 (Black) maps to pure White (#FFFFFF).
            let displayColor = c;
            if (negativeMode) {
              if (i === 0) displayColor = '#1e293b';
              if (i === 1) displayColor = '#FFFFFF';
            }
            
            // Let's make text visible depending on the resulting display color
            const isDarkBackground = displayColor === '#000000' || displayColor === '#1e293b' || displayColor === '#111827' || (!negativeMode && i === 1) || i === 4 || i === 9; // Roughly dark colors
            const textColor = isDarkBackground ? '#FFFFFF' : '#111827';
            
            const borderStyle = displayColor === '#FFFFFF' || displayColor === '#000000' || displayColor === '#1e293b' || displayColor === '#111827' ? '1px solid #D1D5DB' : 'none';

            return (
              <button
                key={i}
                onClick={() => setClickedColorIndex(i)}
                style={{
                  width: 48, height: 48, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 14, fontWeight: 'bold', cursor: 'pointer', transition: 'all 0.15s ease-out',
                  backgroundColor: displayColor, color: textColor,
                  border: borderStyle,
                  boxShadow: isActive ? '0 0 0 4px rgba(59, 130, 246, 0.5), 0 4px 6px rgba(0,0,0,0.1)' : '0 2px 4px rgba(0,0,0,0.1)',
                  transform: isActive ? 'scale(1.15) translateY(-2px)' : 'scale(1)'
                }}
                title={`Color ${i}`}
              >
                {i}
              </button>
            );
          })}
        </div>

        <div style={{ width: 1, height: 40, background: negativeMode ? '#4B5563' : '#E5E7EB', margin: '0 4px' }} /> {/* Divider */}

        {/* Controls Help */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => alert("Left Click: Paint\nDrag: Continuous Paint\nRight/Mid Click: Pan\nScroll: Zoom\n0-9 keys: Quick Color")}
            style={{
              width: 48, height: 48, borderRadius: 16, background: negativeMode ? '#374151' : '#F3F4F6', color: negativeMode ? '#D1D5DB' : '#6B7280',
              border: negativeMode ? '1px solid #4B5563' : '1px solid #E5E7EB', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 20, fontWeight: 'bold', cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 2px 5px rgba(0,0,0,0.05)'
            }}
            title="Help Instructions"
          >
            ?
          </button>
        </div>

        {/* GitHub Link */}
        <a
          href="https://github.com/clockworklabs/SpacetimeDB"
          target="_blank"
          rel="noreferrer"
          style={{
            width: 48, height: 48, borderRadius: 16, background: negativeMode ? '#000000' : '#111827', color: '#FFFFFF',
            border: negativeMode ? '1px solid #4B5563' : '1px solid #374151', display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 4px 6px rgba(0,0,0,0.2)', marginLeft: 4
          }}
          title="View on GitHub"
        >
          <svg style={{ width: 24, height: 24 }} fill="currentColor" viewBox="0 0 24 24"><path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" /></svg>
        </a>

      </div>

      <canvas
        ref={canvasRef}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onContextMenu={e => e.preventDefault()}
        style={{ display: 'block', touchAction: 'none', cursor: 'crosshair', width: '100vw', height: '100vh', position: 'absolute', top: 0, left: 0 }}
      />
    </div>
  );
}

