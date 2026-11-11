import {
  CaptureUpdateAction,
  DefaultSidebar,
  Sidebar,
  useExcalidrawAPI,
} from "@excalidraw/excalidraw";
import {
  LibraryIcon,
  presentationIcon,
   searchIcon,
} from "@excalidraw/excalidraw/components/icons";
import { useUIAppState } from "@excalidraw/excalidraw/context/ui-appState";
import React, { useCallback, useEffect, useState } from "react";

import { useAtom } from "../app-jotai";
import {
  activeBoardIdAtom,
  activeBoardTitleAtom,
  boardSaveStatusAtom,
  boardsListAtom,
  buildPreloadedLibraryItems,
  createNewServerBoard,
  deleteServerBoard,
  fetchServerBoards,
  loadServerBoardIntoCanvas,
  saveCanvasToServerBoard,
} from "../data/boardStore";
import {
  ARCHITECTURE_BLUEPRINTS,
  convertCarlGraphToExcalidraw,
  exportExcalidrawToCarlAst,
  type CarlPreset,
} from "../data/carlBridge";

import "./AppSidebar.scss";

export const AppSidebar: React.FC = () => {
  const { openSidebar } = useUIAppState();
  const excalidrawAPI = useExcalidrawAPI();

  const [activeBoardId, setActiveBoardId] = useAtom(activeBoardIdAtom);
  const [activeBoardTitle, setActiveBoardTitle] = useAtom(activeBoardTitleAtom);
  const [saveStatus, setSaveStatus] = useAtom(boardSaveStatusAtom);
  const [boards, setBoards] = useAtom(boardsListAtom);

  const [newBoardTitle, setNewBoardTitle] = useState("");
  const [carlPresets, setCarlPresets] = useState<CarlPreset[]>([]);
  const [carlInputJson, setCarlInputJson] = useState("");
  const [carlExportJson, setCarlExportJson] = useState("");
  const [carlExportMermaid, setCarlExportMermaid] = useState("");
  const [carlStatusMsg, setCarlStatusMsg] = useState("");

  const refreshBoards = useCallback(async () => {
    const list = await fetchServerBoards();
    setBoards(list);
  }, [setBoards]);

  useEffect(() => {
    refreshBoards();
    fetch("/api/carl/presets", { headers: { Accept: "application/json" } })
      .then((r) => (r.ok ? r.json() : { presets: [] }))
      .then((data) => {
        if (Array.isArray(data.presets)) {
          setCarlPresets(data.presets);
        }
      })
      .catch(() => {
        // ignore network error
      });
  }, [refreshBoards]);

  const handleSaveNow = async () => {
    if (!excalidrawAPI) return;
    setSaveStatus("saving");
    const saved = await saveCanvasToServerBoard(
      activeBoardId,
      activeBoardTitle || "Untitled Board",
      excalidrawAPI,
    );
    if (saved) {
      setSaveStatus("saved");
      refreshBoards();
      excalidrawAPI.setToast({
        message: `Saved "${saved.title}" to home-01`,
        duration: 2000,
      });
    } else {
      setSaveStatus("error");
    }
  };

  const handleSwitchBoard = async (id: string) => {
    if (!excalidrawAPI) return;
    const loaded = await loadServerBoardIntoCanvas(id, excalidrawAPI);
    if (loaded) {
      setActiveBoardId(loaded.id);
      setActiveBoardTitle(loaded.title);
      setSaveStatus("saved");
      excalidrawAPI.setToast({
        message: `Loaded board: ${loaded.title}`,
        duration: 2000,
      });
    }
  };

  const handleCreateBoard = async () => {
    const title = newBoardTitle.trim() || `Board ${boards.length + 1}`;
    const created = await createNewServerBoard(title, excalidrawAPI || undefined);
    if (created) {
      setActiveBoardId(created.id);
      setActiveBoardTitle(created.title);
      setNewBoardTitle("");
      setSaveStatus("saved");
      await refreshBoards();
      excalidrawAPI?.setToast({
        message: `Created board: ${created.title}`,
        duration: 2000,
      });
    }
  };

  const handleDeleteBoard = async (id: string, title: string) => {
    const ok = await deleteServerBoard(id);
    if (ok) {
      const updated = await fetchServerBoards();
      setBoards(updated);
      if (id === activeBoardId && updated.length > 0 && excalidrawAPI) {
        const next = updated[0];
        await handleSwitchBoard(next.id);
      }
      excalidrawAPI?.setToast({
        message: `Deleted board: ${title}`,
        duration: 2000,
      });
    }
  };

  const handleInsertCarlAst = (astInput: any, replaceCanvas: boolean, label: string) => {
    if (!excalidrawAPI) return;
    try {
      const generated = convertCarlGraphToExcalidraw(astInput);
      const existing = replaceCanvas ? [] : excalidrawAPI.getSceneElements();
      const nextElements = [...existing, ...generated];
      excalidrawAPI.updateScene({
        elements: nextElements,
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      });
      excalidrawAPI.scrollToContent(generated, {
        fitToViewport: true,
        animate: true,
      });
      setCarlStatusMsg(`Rendered ${generated.length} elements from ${label}`);
      excalidrawAPI.setToast({
        message: `Imported ${label} onto canvas`,
        duration: 2200,
      });
    } catch (err: any) {
      setCarlStatusMsg(`Error: ${err?.message || String(err)}`);
    }
  };

  const handleExportToCarl = () => {
    if (!excalidrawAPI) return;
    const { ast, mermaid } = exportExcalidrawToCarlAst(
      excalidrawAPI.getSceneElements(),
    );
    setCarlExportJson(JSON.stringify(ast, null, 2));
    setCarlExportMermaid(mermaid);
    setCarlStatusMsg(
      `Exported ${ast.nodes.length} nodes and ${ast.edges.length} edges to Carl GraphAST`,
    );
  };

  const handleDownloadCarlJson = () => {
    if (!carlExportJson) return;
    const blob = new Blob([carlExportJson], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${activeBoardId || "diagram"}.carl.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <DefaultSidebar>
      <DefaultSidebar.TabTriggers>
        <Sidebar.TabTrigger
          tab="boards"
          title="Server Boards (home-01)"
          style={{ opacity: openSidebar?.tab === "boards" ? 1 : 0.45 }}
        >
          {LibraryIcon}
        </Sidebar.TabTrigger>
        <Sidebar.TabTrigger
          tab="carl"
          title="Carl / Technical Illustration AST"
          style={{ opacity: openSidebar?.tab === "carl" ? 1 : 0.45 }}
        >
          {presentationIcon}
        </Sidebar.TabTrigger>
        <Sidebar.TabTrigger
          tab="blueprints"
          title="Architecture Blueprints"
          style={{ opacity: openSidebar?.tab === "blueprints" ? 1 : 0.45 }}
        >
          {searchIcon}
        </Sidebar.TabTrigger>
      </DefaultSidebar.TabTriggers>

      <Sidebar.Tab tab="boards">
        <div className="homeport-sidebar-panel">
          <div className="hp-section-header">
            <span>Homeport Boards (home-01)</span>
            <span
              className={`hp-badge ${
                saveStatus === "saved"
                  ? "hp-badge--saved"
                  : saveStatus === "saving"
                    ? "hp-badge--saving"
                    : saveStatus === "error"
                      ? "hp-badge--error"
                      : ""
              }`}
            >
              {saveStatus === "saved"
                ? "Saved"
                : saveStatus === "saving"
                  ? "Saving..."
                  : saveStatus === "error"
                    ? "Save Error"
                    : "Ready"}
            </span>
          </div>
          <p className="hp-subtitle">
            Boards persist directly on <code>home-01:/data/boards</code> across
            devices and browser sessions.
          </p>

          <div className="hp-card hp-card--active">
            <label className="hp-meta" htmlFor="hp-active-board-title">
              Active Board Title
            </label>
            <input
              id="hp-active-board-title"
              className="hp-input"
              value={activeBoardTitle}
              onChange={(e) => setActiveBoardTitle(e.target.value)}
              placeholder="Board title..."
            />
            <div className="hp-row">
              <span className="hp-meta">ID: {activeBoardId}</span>
              <button
                type="button"
                className="hp-btn hp-btn--primary"
                onClick={handleSaveNow}
              >
                Save to home-01
              </button>
            </div>
          </div>

          <div className="hp-card">
            <div className="hp-row">
              <input
                className="hp-input"
                value={newBoardTitle}
                onChange={(e) => setNewBoardTitle(e.target.value)}
                placeholder="New board title..."
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleCreateBoard();
                  }
                }}
              />
              <button
                type="button"
                className="hp-btn hp-btn--primary"
                onClick={handleCreateBoard}
              >
                + New
              </button>
            </div>
          </div>

          <div className="hp-section-header">
            <span>Saved Boards ({boards.length})</span>
            <button type="button" className="hp-btn" onClick={refreshBoards}>
              Refresh
            </button>
          </div>

          <div className="hp-board-list">
            {boards.map((b) => {
              const isCurrent = b.id === activeBoardId;
              return (
                <div
                  key={b.id}
                  className={`hp-card ${isCurrent ? "hp-card--active" : ""}`}
                >
                  <div className="hp-row">
                    <strong>{b.title}</strong>
                    {isCurrent && <span className="hp-badge">Active</span>}
                  </div>
                  <div className="hp-meta">
                    {b.elementCount} elements ·{" "}
                    {b.updatedAt
                      ? new Date(b.updatedAt).toLocaleString()
                      : "just now"}
                  </div>
                  <div className="hp-row">
                    <button
                      type="button"
                      className="hp-btn"
                      disabled={isCurrent}
                      onClick={() => handleSwitchBoard(b.id)}
                    >
                      {isCurrent ? "Loaded" : "Open Board"}
                    </button>
                    {boards.length > 1 && (
                      <button
                        type="button"
                        className="hp-btn hp-btn--danger"
                        onClick={() => handleDeleteBoard(b.id, b.title)}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Sidebar.Tab>

      <Sidebar.Tab tab="carl">
        <div className="homeport-sidebar-panel">
          <div className="hp-section-header">
            <span>Carl / Technical Illustration Bridge</span>
            <span className="hp-badge">GraphAST</span>
          </div>
          <p className="hp-subtitle">
            Bidirectional sync with <strong>Technical-Illustration (Carl)</strong>:
            import <code>GraphAST</code> or <code>CustomDiagram</code> JSON onto
            the canvas, or export your freehand Excalidraw diagram into Carl AST
            &amp; Mermaid.
          </p>

          {carlStatusMsg && <div className="hp-badge">{carlStatusMsg}</div>}

          <div className="hp-section-header">
            <span>Carl Presets</span>
          </div>
          {carlPresets.map((preset) => (
            <div key={preset.id} className="hp-card">
              <strong>{preset.name}</strong>
              {preset.subtitle && (
                <span className="hp-meta">{preset.subtitle}</span>
              )}
              {preset.description && (
                <p className="hp-subtitle">{preset.description}</p>
              )}
              <div className="hp-row">
                <button
                  type="button"
                  className="hp-btn hp-btn--primary"
                  onClick={() =>
                    handleInsertCarlAst(preset.ast, true, preset.name)
                  }
                >
                  Load Scene
                </button>
                <button
                  type="button"
                  className="hp-btn"
                  onClick={() =>
                    handleInsertCarlAst(preset.ast, false, preset.name)
                  }
                >
                  Append to Canvas
                </button>
              </div>
            </div>
          ))}

          <div className="hp-card">
            <strong>Import Carl GraphAST / CustomDiagram JSON</strong>
            <textarea
              className="hp-textarea"
              value={carlInputJson}
              onChange={(e) => setCarlInputJson(e.target.value)}
              placeholder='{"nodes": [{"id": "api", "label": "API Gateway", "role": "ingress"}], "edges": []}'
            />
            <div className="hp-row">
              <button
                type="button"
                className="hp-btn hp-btn--primary"
                onClick={() => {
                  try {
                    const parsed = JSON.parse(carlInputJson);
                    handleInsertCarlAst(parsed, false, "Custom Carl JSON");
                  } catch (e: any) {
                    setCarlStatusMsg(`Invalid JSON: ${e?.message}`);
                  }
                }}
              >
                Import onto Canvas
              </button>
              <button
                type="button"
                className="hp-btn"
                onClick={() => setCarlInputJson("")}
              >
                Clear
              </button>
            </div>
          </div>

          <div className="hp-card">
            <div className="hp-row">
              <strong>Export Canvas → Carl AST &amp; Mermaid</strong>
              <button
                type="button"
                className="hp-btn hp-btn--primary"
                onClick={handleExportToCarl}
              >
                Generate AST
              </button>
            </div>
            {carlExportJson && (
              <>
                <label className="hp-meta">Carl GraphAST JSON</label>
                <textarea
                  className="hp-textarea"
                  readOnly
                  value={carlExportJson}
                />
                <div className="hp-row">
                  <button
                    type="button"
                    className="hp-btn"
                    onClick={() => {
                      navigator.clipboard?.writeText(carlExportJson);
                      excalidrawAPI?.setToast({
                        message: "Copied Carl GraphAST JSON",
                        duration: 1800,
                      });
                    }}
                  >
                    Copy JSON
                  </button>
                  <button
                    type="button"
                    className="hp-btn"
                    onClick={handleDownloadCarlJson}
                  >
                    Download .carl.json
                  </button>
                </div>
                <label className="hp-meta">Mermaid Flowchart</label>
                <textarea
                  className="hp-textarea"
                  readOnly
                  value={carlExportMermaid}
                />
                <button
                  type="button"
                  className="hp-btn"
                  onClick={() => {
                    navigator.clipboard?.writeText(carlExportMermaid);
                    excalidrawAPI?.setToast({
                      message: "Copied Mermaid syntax",
                      duration: 1800,
                    });
                  }}
                >
                  Copy Mermaid
                </button>
              </>
            )}
          </div>
        </div>
      </Sidebar.Tab>

      <Sidebar.Tab tab="blueprints">
        <div className="homeport-sidebar-panel">
          <div className="hp-section-header">
            <span>Architecture Blueprints</span>
            <span className="hp-badge">Stencils</span>
          </div>
          <p className="hp-subtitle">
            One-click system architecture templates and preloaded Homeport shape
            libraries.
          </p>

          {ARCHITECTURE_BLUEPRINTS.map((bp) => (
            <div key={bp.id} className="hp-card">
              <strong>{bp.name}</strong>
              {bp.subtitle && <span className="hp-meta">{bp.subtitle}</span>}
              {bp.description && (
                <p className="hp-subtitle">{bp.description}</p>
              )}
              <div className="hp-row">
                <button
                  type="button"
                  className="hp-btn hp-btn--primary"
                  onClick={() => handleInsertCarlAst(bp.ast, false, bp.name)}
                >
                  Insert Blueprint
                </button>
                <button
                  type="button"
                  className="hp-btn"
                  onClick={() => handleInsertCarlAst(bp.ast, true, bp.name)}
                >
                  Replace Scene
                </button>
              </div>
            </div>
          ))}

          <div className="hp-card">
            <strong>Homeport Stencil Library</strong>
            <p className="hp-subtitle">
              Preloads Compute/Service, Database/Volume, Ingress/Gateway, and
              Edge/Client shapes into the Excalidraw Library drawer.
            </p>
            <button
              type="button"
              className="hp-btn hp-btn--primary"
              onClick={() => {
                if (!excalidrawAPI) return;
                excalidrawAPI.updateLibrary({
                  libraryItems: buildPreloadedLibraryItems(),
                  merge: true,
                });
                excalidrawAPI.setToast({
                  message: "Synced Homeport stencils to Library",
                  duration: 2000,
                });
              }}
            >
              Sync Stencils to Library
            </button>
          </div>
        </div>
      </Sidebar.Tab>
    </DefaultSidebar>
  );
};
