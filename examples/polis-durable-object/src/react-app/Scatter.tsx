import type { MathResult } from "../shared/types";

// Every participant who has voted, placed by the PCA, colored and shaped by
// opinion group. Plain SVG, no chart library.

const WIDTH = 400;
const HEIGHT = 300;
const PAD = 20;
const R = 4;

type Shape = "circle" | "square" | "triangle" | "diamond" | "plus";
const SHAPES: Shape[] = ["circle", "square", "triangle", "diamond", "plus"];
const groupLetter = (group: number) => String.fromCharCode(65 + group);
const groupColor = (group: number) => `var(--group-${group})`;

function Marker({ shape, x, y, r, fill }: { shape: Shape; x: number; y: number; r: number; fill: string }) {
  // A ring in the panel color keeps overlapping markers apart.
  const ring = { fill, stroke: "var(--panel)", strokeWidth: 1.5 };
  if (shape === "circle") return <circle cx={x} cy={y} r={r} {...ring} />;
  if (shape === "square") return <rect x={x - r} y={y - r} width={2 * r} height={2 * r} {...ring} />;
  const points =
    shape === "triangle"
      ? [[x, y - 1.2 * r], [x + 1.1 * r, y + 0.8 * r], [x - 1.1 * r, y + 0.8 * r]]
      : shape === "diamond"
        ? [[x, y - 1.3 * r], [x + 1.3 * r, y], [x, y + 1.3 * r], [x - 1.3 * r, y]]
        : [[-1, -3], [1, -3], [1, -1], [3, -1], [3, 1], [1, 1], [1, 3], [-1, 3], [-1, 1], [-3, 1], [-3, -1], [-1, -1]].map(
            ([dx, dy]) => [x + (dx * r) / 2.4, y + (dy * r) / 2.4],
          );
  return <polygon points={points.map((p) => p.join(",")).join(" ")} {...ring} />;
}

export function Scatter({ math, selfId }: { math: MathResult | null; selfId: string | undefined }) {
  if (!math || math.participants.length === 0) {
    return (
      <section className="panel scatter">
        <h2>Opinion map</h2>
        <p className="muted">The map appears a few seconds after the first votes.</p>
      </section>
    );
  }

  // One scale for both axes, so distances on the map mean the same either
  // way, fitted around the points and group centers.
  const xs = [...math.participants.map((p) => p.x), ...math.groups.map((g) => g.center[0])];
  const ys = [...math.participants.map((p) => p.y), ...math.groups.map((g) => g.center[1])];
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const scale = Math.min((WIDTH - 2 * PAD) / (maxX - minX || 1), (HEIGHT - 2 * PAD) / (maxY - minY || 1));
  const sx = (x: number) => WIDTH / 2 + (x - (minX + maxX) / 2) * scale;
  const sy = (y: number) => HEIGHT / 2 - (y - (minY + maxY) / 2) * scale;

  const self = math.participants.find((p) => p.id === selfId);
  const unclustered = math.participants.filter((p) => p.group === null).length;
  // Unclustered first, so the grouped markers draw on top.
  const ordered = [...math.participants].sort((a, b) => (a.group === null ? -1 : 0) - (b.group === null ? -1 : 0));

  return (
    <section className="panel scatter">
      <h2 id="scatter-heading">Opinion map</h2>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-labelledby="scatter-heading scatter-desc">
        <desc id="scatter-desc">
          {math.participants.length} participants placed by how they voted, in {math.groups.length} opinion groups.
        </desc>
        <line x1={sx(0)} x2={sx(0)} y1={0} y2={HEIGHT} stroke="var(--border)" strokeWidth={1} />
        <line x1={0} x2={WIDTH} y1={sy(0)} y2={sy(0)} stroke="var(--border)" strokeWidth={1} />
        {ordered.map((p) => {
          const label = `${p.id === selfId ? "You" : `Participant ${p.id}`} · ${
            p.group === null ? "not clustered" : `group ${groupLetter(p.group)}`
          } · ${p.nVotes} votes`;
          return (
            <g key={p.id}>
              <title>{label}</title>
              {/* A bigger, invisible hit target for the tooltip. */}
              <circle cx={sx(p.x)} cy={sy(p.y)} r={R + 4} fill="transparent" />
              {p.group === null ? (
                <circle cx={sx(p.x)} cy={sy(p.y)} r={R - 1} fill="var(--muted)" opacity={0.5} />
              ) : (
                <Marker shape={SHAPES[p.group]} x={sx(p.x)} y={sy(p.y)} r={R} fill={groupColor(p.group)} />
              )}
            </g>
          );
        })}
        {math.groups.map((g) => (
          <text
            key={g.id}
            x={sx(g.center[0])}
            y={sy(g.center[1])}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={16}
            fontWeight={700}
            fill="var(--text)"
            stroke="var(--panel)"
            strokeWidth={4}
            paintOrder="stroke"
            aria-hidden="true"
          >
            {groupLetter(g.id)}
          </text>
        ))}
        {self && (
          <g aria-hidden="true">
            <circle cx={sx(self.x)} cy={sy(self.y)} r={R + 5} fill="none" stroke="var(--text)" strokeWidth={2} />
            <text x={sx(self.x) + R + 9} y={sy(self.y)} dominantBaseline="central" fontSize={12} fill="var(--text)" stroke="var(--panel)" strokeWidth={3} paintOrder="stroke">
              You
            </text>
          </g>
        )}
      </svg>
      <ul className="legend">
        {math.groups.map((g) => (
          <li key={g.id}>
            <svg viewBox="0 0 14 14" aria-hidden="true">
              <Marker shape={SHAPES[g.id]} x={7} y={7} r={5} fill={groupColor(g.id)} />
            </svg>
            Group {groupLetter(g.id)} · {g.members}
          </li>
        ))}
        {unclustered > 0 && (
          <li>
            <svg viewBox="0 0 14 14" aria-hidden="true">
              <circle cx={7} cy={7} r={4} fill="var(--muted)" opacity={0.5} />
            </svg>
            Not clustered (too few votes) · {unclustered}
          </li>
        )}
        {!self && <li className="muted">Vote to appear on the map</li>}
      </ul>
      <p className="muted hint debug">
        k = {math.k ?? "none"}
        {Object.keys(math.silhouettes).length > 0 &&
          ` · silhouette by k: ${Object.entries(math.silhouettes)
            .map(([k, s]) => `${k}: ${s.toFixed(3)}`)
            .join(", ")}`}
        {` · computed ${new Date(math.computedAt).toLocaleTimeString()}`}
      </p>
    </section>
  );
}
