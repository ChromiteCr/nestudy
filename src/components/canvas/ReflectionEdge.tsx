import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps, type Edge } from '@xyflow/react'

export interface ReflectionEdgeData extends Record<string, unknown> {
  label: string
  strength: number
  artifactTitle?: string
}

/**
 * 画板的高光：**绑了反思的边是实线加粗、带标题；没绑的是发丝虚线。**
 *
 * 整张图因此一眼能看出学生在哪些连接上真正思考过，而不只是连了线。
 */
export function ReflectionEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
}: EdgeProps<Edge<ReflectionEdgeData>>) {
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })

  const hasReflection = Boolean(data?.artifactTitle)
  // 强度 1–5 映射到 1.4–3.2px；未绑反思的边一律发丝
  const width = hasReflection ? 1.4 + ((data?.strength ?? 3) - 1) * 0.45 : 1

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        style={{
          strokeWidth: width,
          stroke: selected ? 'var(--signature)' : hasReflection ? 'var(--foreground)' : 'var(--muted-foreground)',
          strokeOpacity: hasReflection ? 0.75 : 0.35,
          strokeDasharray: hasReflection ? undefined : '3 4',
        }}
      />
      {hasReflection && (
        <EdgeLabelRenderer>
          <div
            className="pointer-events-none absolute rounded-sm border bg-card/95 px-1.5 py-0.5 font-mono text-[10px] leading-none tracking-tight text-muted-foreground shadow-xs"
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          >
            {data?.artifactTitle}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}
