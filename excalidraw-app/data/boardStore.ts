import {
  convertToExcalidrawElements,
  getNonDeletedElements,
  CaptureUpdateAction,
} from "@excalidraw/excalidraw";
import { restoreElements } from "@excalidraw/excalidraw/data/restore";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import { atom } from "../app-jotai";

export interface ServerBoardSummary {
  id: string;
  title: string;
  tags: string[];
  elementCount: number;
  createdAt: string | null;
  updatedAt: string | null;
}

export const activeBoardIdAtom = atom<string>("home-01-architecture");
export const activeBoardTitleAtom = atom<string>("home-01 Fleet Architecture");
export const boardSaveStatusAtom = atom<"idle" | "saving" | "saved" | "error">("idle");
export const boardsListAtom = atom<ServerBoardSummary[]>([]);

const ACTIVE_BOARD_STORAGE_KEY = "homeport_excalidraw_active_board_id";

export function getStoredActiveBoardId(): string {
  try {
    return localStorage.getItem(ACTIVE_BOARD_STORAGE_KEY) || "home-01-architecture";
  } catch {
    return "home-01-architecture";
  }
}

export function setStoredActiveBoardId(id: string): void {
  try {
    localStorage.setItem(ACTIVE_BOARD_STORAGE_KEY, id);
  } catch {
    // ignore storage errors
  }
}

export async function fetchServerBoards(): Promise<ServerBoardSummary[]> {
  try {
    const res = await fetch("/api/boards", { headers: { Accept: "application/json" } });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.boards) ? data.boards : [];
  } catch {
    return [];
  }
}

export async function loadServerBoardIntoCanvas(
  id: string,
  excalidrawAPI: ExcalidrawImperativeAPI,
): Promise<{ id: string; title: string } | null> {
  const res = await fetch(`/api/boards/${encodeURIComponent(id)}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) return null;
  const data = await res.json();
  const board = data?.board;
  if (!board) return null;

  const elements = restoreElements(Array.isArray(board.elements) ? board.elements : [], null);
  if (board.files && typeof board.files === "object") {
    const fileValues = Object.values(board.files) as any[];
    if (fileValues.length > 0) {
      excalidrawAPI.addFiles(fileValues);
    }
  }
  excalidrawAPI.updateScene({
    elements,
    appState: {
      viewBackgroundColor: board.appState?.viewBackgroundColor || "#ffffff",
      name: String(board.title || "Untitled Board"),
    },
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
  if (elements.length > 0) {
    excalidrawAPI.setViewport({
      target: elements,
      fit: "scale-down",
      animation: true,
    });
  }
  setStoredActiveBoardId(board.id);
  return { id: board.id, title: board.title || "Untitled Board" };
}

export async function saveCanvasToServerBoard(
  id: string,
  title: string,
  excalidrawAPI: ExcalidrawImperativeAPI,
  tags: string[] = ["homeport"],
): Promise<ServerBoardSummary | null> {
  const elements = getNonDeletedElements(excalidrawAPI.getSceneElements());
  const appState = excalidrawAPI.getAppState();
  const files = excalidrawAPI.getFiles();

  const res = await fetch(`/api/boards/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id,
      title,
      tags,
      elements,
      appState: {
        viewBackgroundColor: appState.viewBackgroundColor,
        gridSize: appState.gridSize,
      },
      files,
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const saved = data?.board;
  if (!saved) return null;
  setStoredActiveBoardId(saved.id);
  return {
    id: saved.id,
    title: saved.title,
    tags: saved.tags || [],
    elementCount: elements.length,
    createdAt: saved.createdAt,
    updatedAt: saved.updatedAt,
  };
}

export async function createNewServerBoard(
  title: string,
  excalidrawAPI?: ExcalidrawImperativeAPI,
): Promise<{ id: string; title: string } | null> {
  const res = await fetch("/api/boards", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title,
      tags: ["homeport"],
      elements: [],
      appState: { viewBackgroundColor: "#ffffff" },
      files: {},
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const board = data?.board;
  if (!board) return null;
  if (excalidrawAPI) {
    excalidrawAPI.updateScene({
      elements: [],
      appState: { name: board.title },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
  }
  setStoredActiveBoardId(board.id);
  return { id: board.id, title: board.title };
}

export async function deleteServerBoard(id: string): Promise<boolean> {
  const res = await fetch(`/api/boards/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  return res.ok;
}

export function buildPreloadedLibraryItems(): any[] {
  const now = Date.now();
  const serviceCard = convertToExcalidrawElements([
    {
      type: "rectangle",
      x: 0,
      y: 0,
      width: 190,
      height: 76,
      backgroundColor: "#dcfce7",
      strokeColor: "#15803d",
      fillStyle: "solid",
      strokeWidth: 2,
      roundness: { type: 3 },
      label: { text: "Service Container\n(:3000)", fontSize: 16 },
    },
  ]);
  const datastoreCard = convertToExcalidrawElements([
    {
      type: "rectangle",
      x: 0,
      y: 0,
      width: 190,
      height: 76,
      backgroundColor: "#fef3c7",
      strokeColor: "#b45309",
      fillStyle: "solid",
      strokeWidth: 2,
      roundness: { type: 3 },
      label: { text: "PostgreSQL / DB\n(Private Volume)", fontSize: 16 },
    },
  ]);
  const gatewayDiamond = convertToExcalidrawElements([
    {
      type: "diamond",
      x: 0,
      y: 0,
      width: 180,
      height: 100,
      backgroundColor: "#dbeafe",
      strokeColor: "#1d4ed8",
      fillStyle: "solid",
      strokeWidth: 2,
      roundness: { type: 2 },
      label: { text: "Ingress / Auth\nGateway", fontSize: 16 },
    },
  ]);
  const edgeClient = convertToExcalidrawElements([
    {
      type: "ellipse",
      x: 0,
      y: 0,
      width: 170,
      height: 80,
      backgroundColor: "#e0e7ff",
      strokeColor: "#4338ca",
      fillStyle: "solid",
      strokeWidth: 2,
      label: { text: "Client / Browser", fontSize: 16 },
    },
  ]);

  return [
    {
      id: "homeport-lib-service",
      status: "published",
      created: now,
      name: "Compute / Service Node",
      elements: serviceCard,
    },
    {
      id: "homeport-lib-datastore",
      status: "published",
      created: now,
      name: "Database / Volume Node",
      elements: datastoreCard,
    },
    {
      id: "homeport-lib-gateway",
      status: "published",
      created: now,
      name: "Ingress / Gateway Diamond",
      elements: gatewayDiamond,
    },
    {
      id: "homeport-lib-client",
      status: "published",
      created: now,
      name: "Edge / Client Actor",
      elements: edgeClient,
    },
  ];
}
