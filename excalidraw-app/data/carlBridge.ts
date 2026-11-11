import {
  convertToExcalidrawElements,
  getNonDeletedElements,
} from "@excalidraw/excalidraw";

import type {
  ExcalidrawElement,
  NonDeletedExcalidrawElement,
} from "@excalidraw/element/types";

export interface CarlGraphNode {
  id: string;
  label: string;
  type?: string;
  role?: string;
  group?: string;
  details?: string[];
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

export interface CarlGraphEdge {
  from: string;
  to: string;
  label?: string;
  protocol?: string;
}

export interface CarlGraphAST {
  nodes: CarlGraphNode[];
  edges: CarlGraphEdge[];
}

export interface CarlPreset {
  id: string;
  name: string;
  subtitle?: string;
  description?: string;
  ast: CarlGraphAST;
}

const ROLE_STYLES: Record<
  string,
  {
    bg: string;
    stroke: string;
    headerBg: string;
    headerStroke: string;
  }
> = {
  ingress: {
    bg: "#dbeafe",
    stroke: "#1d4ed8",
    headerBg: "#eff6ff",
    headerStroke: "#93c5fd",
  },
  gateway: {
    bg: "#dbeafe",
    stroke: "#1d4ed8",
    headerBg: "#eff6ff",
    headerStroke: "#93c5fd",
  },
  control: {
    bg: "#ede9fe",
    stroke: "#6d28d9",
    headerBg: "#f5f3ff",
    headerStroke: "#c4b5fd",
  },
  edge: {
    bg: "#e0e7ff",
    stroke: "#4338ca",
    headerBg: "#eef2ff",
    headerStroke: "#a5b4fc",
  },
  client: {
    bg: "#e0e7ff",
    stroke: "#4338ca",
    headerBg: "#eef2ff",
    headerStroke: "#a5b4fc",
  },
  compute: {
    bg: "#dcfce7",
    stroke: "#15803d",
    headerBg: "#f0fdf4",
    headerStroke: "#86efac",
  },
  service: {
    bg: "#dcfce7",
    stroke: "#15803d",
    headerBg: "#f0fdf4",
    headerStroke: "#86efac",
  },
  datastore: {
    bg: "#fef3c7",
    stroke: "#b45309",
    headerBg: "#fffbeb",
    headerStroke: "#fcd34d",
  },
  database: {
    bg: "#fef3c7",
    stroke: "#b45309",
    headerBg: "#fffbeb",
    headerStroke: "#fcd34d",
  },
  storage: {
    bg: "#ffedd5",
    stroke: "#c2410c",
    headerBg: "#fff7ed",
    headerStroke: "#fdba74",
  },
  default: {
    bg: "#f1f5f9",
    stroke: "#334155",
    headerBg: "#f8fafc",
    headerStroke: "#cbd5e1",
  },
};

export function normalizeCarlInputToAst(input: any): CarlGraphAST {
  if (!input || typeof input !== "object") {
    throw new Error("Expected a JSON object (GraphAST or CustomDiagram)");
  }
  const candidate =
    input.ast && typeof input.ast === "object" ? input.ast : input;
  if (Array.isArray(candidate.nodes) && Array.isArray(candidate.edges)) {
    return {
      nodes: candidate.nodes.map((n: any, idx: number) => ({
        id: String(n.id || `node_${idx + 1}`),
        label: String(n.label || n.name || n.id || `Node ${idx + 1}`),
        type: n.type ? String(n.type) : "service",
        role: n.role ? String(n.role) : undefined,
        group: n.group ? String(n.group) : undefined,
        details: Array.isArray(n.details) ? n.details.map(String) : undefined,
        x: typeof n.x === "number" ? n.x : undefined,
        y: typeof n.y === "number" ? n.y : undefined,
        width: typeof n.width === "number" ? n.width : undefined,
        height: typeof n.height === "number" ? n.height : undefined,
      })),
      edges: candidate.edges.map((e: any) => ({
        from: String(e.from || e.source || ""),
        to: String(e.to || e.target || ""),
        label: e.label
          ? String(e.label)
          : e.protocol
            ? String(e.protocol)
            : undefined,
      })),
    };
  }

  if (candidate.labels && typeof candidate.labels === "object") {
    const entries = Object.entries(candidate.labels);
    const groupName = String(
      candidate.name || candidate.subtitle || "Technical Illustration",
    );
    const nodes: CarlGraphNode[] = entries.map(([key, val], idx) => ({
      id: `step_${key}`,
      label: String(val),
      type:
        idx === 0
          ? "client"
          : idx === entries.length - 1
            ? "service"
            : "gateway",
      role:
        idx === 0
          ? "edge"
          : idx === entries.length - 1
            ? "compute"
            : "ingress",
      group: groupName,
    }));
    const edges: CarlGraphEdge[] = [];
    for (let i = 0; i < nodes.length - 1; i++) {
      edges.push({
        from: nodes[i].id,
        to: nodes[i + 1].id,
      });
    }
    return { nodes, edges };
  }

  throw new Error(
    "Unrecognized JSON structure. Provide a Technical-Illustration GraphAST ({ nodes, edges }) or CustomDiagram ({ labels }).",
  );
}

export function convertCarlGraphToExcalidraw(
  rawInput: any,
): NonDeletedExcalidrawElement[] {
  const ast = normalizeCarlInputToAst(rawInput);
  const groups = new Map<string, CarlGraphNode[]>();
  for (const node of ast.nodes) {
    const g = node.group || "Architecture";
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(node);
  }

  // Determine maximum columns across all groups so all swimlanes share a clean aligned width
  const MAX_COLS_PER_ROW = 4;
  let maxColsInAnyGroup = 1;
  for (const groupNodes of groups.values()) {
    const cols = Math.min(MAX_COLS_PER_ROW, Math.max(1, groupNodes.length));
    if (cols > maxColsInAnyGroup) maxColsInAnyGroup = cols;
  }

  const NODE_W = 230;
  const NODE_H = 84;
  const COL_GAP = 48;
  const ROW_GAP = 44;
  const SWIMLANE_PAD_X = 48;
  const SWIMLANE_TOP_PAD = 54;
  const SWIMLANE_BOTTOM_PAD = 32;
  const LAYER_GAP = 76;
  const CENTER_X = 640;

  const unifiedSwimlaneWidth = Math.max(
    760,
    maxColsInAnyGroup * NODE_W +
      (maxColsInAnyGroup - 1) * COL_GAP +
      SWIMLANE_PAD_X * 2,
  );
  const swimlaneX = Math.round(CENTER_X - unifiedSwimlaneWidth / 2);

  const backgroundSkeletons: any[] = [];
  const nodeSkeletons: any[] = [];
  const arrowSkeletons: any[] = [];

  const nodePositions = new Map<
    string,
    { x: number; y: number; w: number; h: number; groupIdx: number }
  >();

  let cursorY = 80;
  let groupIdx = 0;

  for (const [groupName, groupNodes] of groups.entries()) {
    const cols = Math.min(MAX_COLS_PER_ROW, Math.max(1, groupNodes.length));
    const rows = Math.ceil(groupNodes.length / cols);
    const groupH =
      SWIMLANE_TOP_PAD +
      rows * NODE_H +
      (rows - 1) * ROW_GAP +
      SWIMLANE_BOTTOM_PAD;

    // Dashed swimlane frame (transparent fill so it never obscures nodes or arrows)
    backgroundSkeletons.push({
      type: "rectangle",
      x: swimlaneX,
      y: cursorY,
      width: unifiedSwimlaneWidth,
      height: groupH,
      backgroundColor: "transparent",
      strokeColor: "#94a3b8",
      strokeStyle: "dashed",
      strokeWidth: 1,
      fillStyle: "solid",
      roundness: { type: 3 },
    });

    // Swimlane section header label
    backgroundSkeletons.push({
      type: "text",
      x: swimlaneX + 20,
      y: cursorY + 14,
      text: groupName.toUpperCase(),
      fontSize: 14,
      fontFamily: 2,
      strokeColor: "#475569",
    });

    groupNodes.forEach((node, idx) => {
      const row = Math.floor(idx / cols);
      const col = idx % cols;
      // Number of items in this specific row (for centering partial rows)
      const itemsInThisRow =
        row === rows - 1 ? groupNodes.length - row * cols : cols;
      const rowContentWidth =
        itemsInThisRow * NODE_W + (itemsInThisRow - 1) * COL_GAP;
      const rowStartX = Math.round(CENTER_X - rowContentWidth / 2);

      const w = node.width || NODE_W;
      const h = node.height || NODE_H;
      const x =
        typeof node.x === "number"
          ? node.x
          : rowStartX + col * (NODE_W + COL_GAP);
      const y =
        typeof node.y === "number"
          ? node.y
          : cursorY + SWIMLANE_TOP_PAD + row * (NODE_H + ROW_GAP);

      nodePositions.set(node.id, { x, y, w, h, groupIdx });

      const styleKey = (node.role || node.type || "default").toLowerCase();
      const style = ROLE_STYLES[styleKey] || ROLE_STYLES.default;

      nodeSkeletons.push({
        type: "rectangle",
        id: `carl_${node.id}`,
        x,
        y,
        width: w,
        height: h,
        backgroundColor: style.bg,
        strokeColor: style.stroke,
        fillStyle: "solid",
        strokeWidth: 2,
        roundness: { type: 3 },
        label: {
          text: node.label,
          fontSize: 16,
          fontFamily: 2,
          strokeColor: "#0f172a",
        },
      });
    });

    cursorY += groupH + LAYER_GAP;
    groupIdx++;
  }

  // Count outgoing and incoming edges per node to fan out anchor points cleanly
  const outgoingByNode = new Map<string, CarlGraphEdge[]>();
  const incomingByNode = new Map<string, CarlGraphEdge[]>();
  for (const edge of ast.edges) {
    if (!nodePositions.has(edge.from) || !nodePositions.has(edge.to)) continue;
    if (!outgoingByNode.has(edge.from)) outgoingByNode.set(edge.from, []);
    outgoingByNode.get(edge.from)!.push(edge);
    if (!incomingByNode.has(edge.to)) incomingByNode.set(edge.to, []);
    incomingByNode.get(edge.to)!.push(edge);
  }

  // Sort outgoing/incoming edges by target/source X coordinate so fanned arrows don't cross
  for (const [fromId, list] of outgoingByNode.entries()) {
    list.sort(
      (a, b) =>
        (nodePositions.get(a.to)?.x ?? 0) - (nodePositions.get(b.to)?.x ?? 0),
    );
    outgoingByNode.set(fromId, list);
  }
  for (const [toId, list] of incomingByNode.entries()) {
    list.sort(
      (a, b) =>
        (nodePositions.get(a.from)?.x ?? 0) -
        (nodePositions.get(b.from)?.x ?? 0),
    );
    incomingByNode.set(toId, list);
  }

  for (const edge of ast.edges) {
    const fromPos = nodePositions.get(edge.from);
    const toPos = nodePositions.get(edge.to);
    if (!fromPos || !toPos) continue;

    const outList = outgoingByNode.get(edge.from) || [edge];
    const inList = incomingByNode.get(edge.to) || [edge];
    const outIdx = Math.max(0, outList.indexOf(edge));
    const inIdx = Math.max(0, inList.indexOf(edge));

    const outSpread =
      outList.length > 1
        ? (outIdx - (outList.length - 1) / 2) *
          Math.min(28, (fromPos.w - 40) / outList.length)
        : 0;
    const inSpread =
      inList.length > 1
        ? (inIdx - (inList.length - 1) / 2) *
          Math.min(28, (toPos.w - 40) / inList.length)
        : 0;

    let startX: number;
    let startY: number;
    let endX: number;
    let endY: number;

    const sameRow = Math.abs(fromPos.y - toPos.y) < 30;
    if (sameRow) {
      // Horizontal connection within the same tier
      const goingRight = toPos.x >= fromPos.x;
      startX = goingRight ? fromPos.x + fromPos.w : fromPos.x;
      startY = fromPos.y + fromPos.h / 2;
      endX = goingRight ? toPos.x : toPos.x + toPos.w;
      endY = toPos.y + toPos.h / 2;
    } else if (toPos.y > fromPos.y) {
      // Top-down connection between tiers
      startX = Math.round(fromPos.x + fromPos.w / 2 + outSpread);
      startY = fromPos.y + fromPos.h;
      endX = Math.round(toPos.x + toPos.w / 2 + inSpread);
      endY = toPos.y;
    } else {
      // Bottom-up connection
      startX = Math.round(fromPos.x + fromPos.w / 2 + outSpread);
      startY = fromPos.y;
      endX = Math.round(toPos.x + toPos.w / 2 + inSpread);
      endY = toPos.y + toPos.h;
    }

    // Only attach an inline arrow label if the user explicitly provided one AND the source node isn't fanning out >2 arrows
    const showEdgeLabel = Boolean(edge.label && outList.length <= 2);

    arrowSkeletons.push({
      type: "arrow",
      x: startX,
      y: startY,
      width: endX - startX,
      height: endY - startY,
      strokeColor: "#475569",
      strokeWidth: 2,
      start: { id: `carl_${edge.from}` },
      end: { id: `carl_${edge.to}` },
      ...(showEdgeLabel
        ? {
            label: {
              text: edge.label,
              fontSize: 13,
              fontFamily: 2,
              strokeColor: "#334155",
            },
          }
        : {}),
    });
  }

  return convertToExcalidrawElements(
    [...backgroundSkeletons, ...nodeSkeletons, ...arrowSkeletons],
    { regenerateIds: false },
  );
}

export function exportExcalidrawToCarlAst(
  elements: readonly ExcalidrawElement[],
): {
  ast: CarlGraphAST;
  mermaid: string;
} {
  const active = getNonDeletedElements(elements);
  const textById = new Map<string, string>();
  const textByContainer = new Map<string, string>();

  for (const el of active) {
    if (el.type === "text") {
      const txt = (el as any).text ? String((el as any).text).trim() : "";
      textById.set(el.id, txt);
      if ((el as any).containerId) {
        textByContainer.set(String((el as any).containerId), txt);
      }
    }
  }

  const nodes: CarlGraphNode[] = [];
  const shapeIds = new Set<string>();

  for (const el of active) {
    if (
      el.type === "rectangle" ||
      el.type === "ellipse" ||
      el.type === "diamond"
    ) {
      const boundText = textByContainer.get(el.id);
      if (!boundText && el.strokeStyle === "dashed" && el.width > 350) {
        continue;
      }
      const cleanId = el.id.replace(/^carl_/, "");
      const label = boundText || cleanId;
      const role =
        el.backgroundColor === "#dbeafe"
          ? "ingress"
          : el.backgroundColor === "#ede9fe"
            ? "control"
            : el.backgroundColor === "#e0e7ff"
              ? "edge"
              : el.backgroundColor === "#fef3c7"
                ? "datastore"
                : "compute";
      nodes.push({
        id: cleanId,
        label,
        type:
          role === "ingress"
            ? "gateway"
            : role === "edge"
              ? "client"
              : role === "datastore"
                ? "database"
                : "service",
        role,
        x: Math.round(el.x),
        y: Math.round(el.y),
        width: Math.round(el.width),
        height: Math.round(el.height),
      });
      shapeIds.add(el.id);
    }
  }

  const edges: CarlGraphEdge[] = [];
  for (const el of active) {
    if (el.type === "arrow") {
      const startId = (el as any).startBinding?.elementId;
      const endId = (el as any).endBinding?.elementId;
      if (startId && endId && shapeIds.has(startId) && shapeIds.has(endId)) {
        const edgeLabel = textByContainer.get(el.id);
        edges.push({
          from: String(startId).replace(/^carl_/, ""),
          to: String(endId).replace(/^carl_/, ""),
          ...(edgeLabel ? { label: edgeLabel } : {}),
        });
      }
    }
  }

  const mermaidLines = ["flowchart TD"];
  for (const n of nodes) {
    const safeNodeId = n.id.replace(/[^a-zA-Z0-9_]/g, "_");
    const safeLabel = n.label.replace(/\r?\n/g, " ").replace(/"/g, "'");
    mermaidLines.push(`  ${safeNodeId}["${safeLabel}"]`);
  }
  for (const e of edges) {
    const fromId = e.from.replace(/[^a-zA-Z0-9_]/g, "_");
    const toId = e.to.replace(/[^a-zA-Z0-9_]/g, "_");
    if (e.label) {
      const safeEdgeLabel = e.label.replace(/\r?\n/g, " ").replace(/\|/g, "/");
      mermaidLines.push(`  ${fromId} -->|${safeEdgeLabel}| ${toId}`);
    } else {
      mermaidLines.push(`  ${fromId} --> ${toId}`);
    }
  }

  return {
    ast: { nodes, edges },
    mermaid: mermaidLines.join("\n"),
  };
}

export const ARCHITECTURE_BLUEPRINTS: CarlPreset[] = [
  {
    id: "microservice-stack",
    name: "Full-Stack Service + Postgres + Worker",
    subtitle: "Standard Homeport App Pattern",
    description:
      "Ingress -> Next.js/Express App -> PostgreSQL + Background Scheduler",
    ast: {
      nodes: [
        {
          id: "ingress",
          label: "Tailscale / Cloudflare\nHTTPS Ingress",
          role: "ingress",
          group: "1. Edge & Ingress",
        },
        {
          id: "app",
          label: "App Server\n(Node 24 / Next.js :3000)",
          role: "compute",
          group: "2. Application Tier",
        },
        {
          id: "worker",
          label: "Job Scheduler\n(Sequential Cron)",
          role: "control",
          group: "2. Application Tier",
        },
        {
          id: "db",
          label: "PostgreSQL 18\n(Private Bridge :5432)",
          role: "datastore",
          group: "3. Data & Backups",
        },
        {
          id: "backup",
          label: "Encrypted Dump\n(.dump.enc + SHA-256)",
          role: "storage",
          group: "3. Data & Backups",
        },
      ],
      edges: [
        { from: "ingress", to: "app", label: "TLS 1.3" },
        { from: "worker", to: "app", label: "POST /api/jobs" },
        { from: "app", to: "db", label: "Drizzle SQL" },
        { from: "db", to: "backup", label: "pg_dump" },
      ],
    },
  },
  {
    id: "ai-rag-pipeline",
    name: "AI / Hybrid RAG Pipeline",
    subtitle: "Ingestion, Embeddings, Vector Search & LLM",
    description:
      "Multi-stage AI orchestration pipeline with pgvector and Gemini/Ollama.",
    ast: {
      nodes: [
        {
          id: "doc_input",
          label: "Source Documents\n& Codebase",
          role: "edge",
          group: "1. Ingestion Layer",
        },
        {
          id: "chunker",
          label: "AST Chunker &\nEmbedding Worker",
          role: "compute",
          group: "1. Ingestion Layer",
        },
        {
          id: "pgvector",
          label: "pgvector Index\n(HNSW Cosine)",
          role: "datastore",
          group: "2. Vector & Lexical Index",
        },
        {
          id: "retriever",
          label: "Hybrid Reranker\n(BM25 + Dense)",
          role: "control",
          group: "3. Inference & Synthesis",
        },
        {
          id: "llm",
          label: "LLM Synthesizer\n(Gemini / Ollama)",
          role: "compute",
          group: "3. Inference & Synthesis",
        },
      ],
      edges: [
        { from: "doc_input", to: "chunker", label: "Parse AST" },
        { from: "chunker", to: "pgvector", label: "Upsert Vectors" },
        { from: "pgvector", to: "retriever", label: "Top-K" },
        { from: "retriever", to: "llm", label: "Grounded Context" },
      ],
    },
  },
];
