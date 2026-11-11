import {
  convertToExcalidrawElements,
  getNonDeletedElements,
} from "@excalidraw/excalidraw";

import type { ExcalidrawElement, NonDeletedExcalidrawElement } from "@excalidraw/element/types";

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
  { bg: string; stroke: string; shape: "rectangle" | "ellipse" | "diamond" }
> = {
  ingress: { bg: "#dbeafe", stroke: "#1d4ed8", shape: "diamond" },
  gateway: { bg: "#dbeafe", stroke: "#1d4ed8", shape: "rectangle" },
  edge: { bg: "#e0e7ff", stroke: "#4338ca", shape: "ellipse" },
  client: { bg: "#e0e7ff", stroke: "#4338ca", shape: "ellipse" },
  compute: { bg: "#dcfce7", stroke: "#15803d", shape: "rectangle" },
  service: { bg: "#dcfce7", stroke: "#15803d", shape: "rectangle" },
  datastore: { bg: "#fef3c7", stroke: "#b45309", shape: "rectangle" },
  database: { bg: "#fef3c7", stroke: "#b45309", shape: "rectangle" },
  storage: { bg: "#ffedd5", stroke: "#c2410c", shape: "rectangle" },
  default: { bg: "#f1f5f9", stroke: "#334155", shape: "rectangle" },
};

export function normalizeCarlInputToAst(input: any): CarlGraphAST {
  if (!input || typeof input !== "object") {
    throw new Error("Expected a JSON object (GraphAST or CustomDiagram)");
  }
  const candidate = input.ast && typeof input.ast === "object" ? input.ast : input;
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
        label: e.label ? String(e.label) : e.protocol ? String(e.protocol) : undefined,
      })),
    };
  }

  // Support Technical-Illustration CustomDiagram format (e.g. example-auth-flow.json with labels map)
  if (candidate.labels && typeof candidate.labels === "object") {
    const entries = Object.entries(candidate.labels);
    const groupName = String(candidate.name || candidate.subtitle || "Technical Illustration");
    const nodes: CarlGraphNode[] = entries.map(([key, val], idx) => ({
      id: `step_${key}`,
      label: String(val),
      type: idx === 0 ? "client" : idx === entries.length - 1 ? "service" : "gateway",
      role: idx === 0 ? "edge" : idx === entries.length - 1 ? "compute" : "ingress",
      group: groupName,
    }));
    const edges: CarlGraphEdge[] = [];
    for (let i = 0; i < nodes.length - 1; i++) {
      edges.push({
        from: nodes[i].id,
        to: nodes[i + 1].id,
        label: `Step ${i + 1}`,
      });
    }
    return { nodes, edges };
  }

  throw new Error(
    "Unrecognized JSON structure. Provide a Technical-Illustration GraphAST ({ nodes, edges }) or CustomDiagram ({ labels }).",
  );
}

export function convertCarlGraphToExcalidraw(rawInput: any): NonDeletedExcalidrawElement[] {
  const ast = normalizeCarlInputToAst(rawInput);
  const groups = new Map<string, CarlGraphNode[]>();
  for (const node of ast.nodes) {
    const g = node.group || "Architecture";
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(node);
  }

  const skeletons: any[] = [];
  const nodePositions = new Map<string, { x: number; y: number; w: number; h: number }>();

  let groupIdx = 0;
  for (const [groupName, groupNodes] of groups.entries()) {
    const cols = Math.min(3, Math.max(1, groupNodes.length));
    const rows = Math.ceil(groupNodes.length / cols);
    const cellW = 240;
    const cellH = 120;
    const padX = 48;
    const padY = 64;
    const groupX = 80;
    const groupY = 80 + groupIdx * (rows * cellH + padY * 2 + 60);
    const groupW = cols * cellW + padX * 2;
    const groupH = rows * cellH + padY * 1.6;

    // Group container rectangle + header text
    skeletons.push({
      type: "rectangle",
      x: groupX,
      y: groupY,
      width: groupW,
      height: groupH,
      backgroundColor: "#f8fafc",
      strokeColor: "#94a3b8",
      strokeStyle: "dashed",
      strokeWidth: 1,
      fillStyle: "solid",
      roundness: { type: 3 },
    });
    skeletons.push({
      type: "text",
      x: groupX + 18,
      y: groupY + 14,
      text: groupName.toUpperCase(),
      fontSize: 14,
      strokeColor: "#475569",
    });

    groupNodes.forEach((node, idx) => {
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      const w = node.width || 190;
      const h = node.height || 76;
      const x = typeof node.x === "number" ? node.x : groupX + padX + col * cellW;
      const y = typeof node.y === "number" ? node.y : groupY + padY + row * cellH;
      nodePositions.set(node.id, { x, y, w, h });

      const styleKey = (node.role || node.type || "default").toLowerCase();
      const style = ROLE_STYLES[styleKey] || ROLE_STYLES.default;
      skeletons.push({
        type: style.shape,
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
          strokeColor: "#0f172a",
        },
      });
    });

    groupIdx++;
  }

  for (const edge of ast.edges) {
    const fromPos = nodePositions.get(edge.from);
    const toPos = nodePositions.get(edge.to);
    if (!fromPos || !toPos) continue;
    const startX = fromPos.x + fromPos.w / 2;
    const startY = fromPos.y + fromPos.h / 2;
    const endX = toPos.x + toPos.w / 2;
    const endY = toPos.y + toPos.h / 2;
    skeletons.push({
      type: "arrow",
      x: startX,
      y: startY,
      width: endX - startX,
      height: endY - startY,
      strokeColor: "#334155",
      strokeWidth: 2,
      start: { id: `carl_${edge.from}` },
      end: { id: `carl_${edge.to}` },
      ...(edge.label
        ? {
            label: {
              text: edge.label,
              fontSize: 14,
              strokeColor: "#1e293b",
            },
          }
        : {}),
    });
  }

  return convertToExcalidrawElements(skeletons, { regenerateIds: false });
}

export function exportExcalidrawToCarlAst(elements: readonly ExcalidrawElement[]): {
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
    if (el.type === "rectangle" || el.type === "ellipse" || el.type === "diamond") {
      // Skip large dashed background group containers that have no bound text
      const boundText = textByContainer.get(el.id);
      if (!boundText && el.strokeStyle === "dashed" && el.width > 350) {
        continue;
      }
      const cleanId = el.id.replace(/^carl_/, "");
      const label = boundText || cleanId;
      const role =
        el.type === "diamond"
          ? "ingress"
          : el.type === "ellipse"
            ? "edge"
            : el.backgroundColor === "#fef3c7"
              ? "datastore"
              : "compute";
      nodes.push({
        id: cleanId,
        label,
        type: el.type === "diamond" ? "gateway" : el.type === "ellipse" ? "client" : "service",
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
    description: "Ingress -> Next.js/Express App -> PostgreSQL + Background Scheduler",
    ast: {
      nodes: [
        { id: "ingress", label: "Tailscale / Cloudflare\nIngress", role: "ingress", group: "Edge" },
        { id: "app", label: "App Server\n(Node 24 / Next.js)", role: "compute", group: "Application" },
        { id: "worker", label: "Job Scheduler\n(Sequential Cron)", role: "compute", group: "Application" },
        { id: "db", label: "PostgreSQL 18\n(Private Network)", role: "datastore", group: "Persistence" },
      ],
      edges: [
        { from: "ingress", to: "app", label: "HTTPS" },
        { from: "app", to: "db", label: "Drizzle SQL" },
        { from: "worker", to: "app", label: "POST /api/jobs/*" },
      ],
    },
  },
  {
    id: "ai-rag-pipeline",
    name: "AI / Hybrid RAG Pipeline",
    subtitle: "Ingestion, Embeddings, Vector Search & LLM",
    description: "Multi-stage AI orchestration pipeline with pgvector and Gemini/Ollama.",
    ast: {
      nodes: [
        { id: "doc_input", label: "Source Documents\n& Codebase", role: "edge", group: "Ingestion" },
        { id: "chunker", label: "AST Chunker &\nEmbedder", role: "compute", group: "Ingestion" },
        { id: "pgvector", label: "pgvector Index\n(HNSW Cosine)", role: "datastore", group: "Storage" },
        { id: "retriever", label: "Hybrid Reranker\n(BM25 + Dense)", role: "compute", group: "Inference" },
        { id: "llm", label: "LLM Synthesizer\n(Gemini / Ollama)", role: "compute", group: "Inference" },
      ],
      edges: [
        { from: "doc_input", to: "chunker", label: "Parse" },
        { from: "chunker", to: "pgvector", label: "Upsert Vectors" },
        { from: "pgvector", to: "retriever", label: "Top-K Candidates" },
        { from: "retriever", to: "llm", label: "Grounded Context" },
      ],
    },
  },
];
