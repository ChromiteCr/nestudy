import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Mono } from '@/components/ui/mono'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ARTIFACT_KIND_LABEL } from '@/lib/artifact-labels'
import type { Artifact } from '@/types'

/**
 * 读一份已经存下来的记录。
 *
 * **这个组件补的是一个很久的空缺：反思存下来之后，学生根本没地方读它。**
 * 在此之前 `Artifact.qa`（访谈的逐字问答）只被 `search_artifacts` 拿去检索、
 * 被模型读，界面上唯一的痕迹是提案卡上一个「N 组问答」的计数——
 * 确认之后原话就再也看不到了。一个以「记录」为主轴的产品把最要紧的东西存了却藏起来。
 *
 * 所以这里的重点不是排版，是**把两种文本分开摆**：
 *
 * - `qa` 是**底稿**：学生自己说的话，一个字都没动过
 * - `content` 是**整理稿**：AI 把那些话按顺序串起来的版本
 *
 * 分开摆是对「AI 会不会替学生思考」这个问题的正面回答——哪句是他说的、
 * 哪句是模型串的，摊开来看得见。两边对不上时以底稿为准，这一条写在界面上，
 * 不藏在文档里。
 */
export function ReflectionReader({
  artifact,
  onClose,
}: {
  /** null 表示不显示。由调用方持有「当前在读哪一份」 */
  artifact: Artifact | null
  onClose: () => void
}) {
  const qa = artifact?.qa ?? []
  const hasQa = qa.length > 0

  return (
    <Dialog open={artifact !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-2xl">
        {artifact && (
          <>
            <DialogHeader className="shrink-0">
              <DialogTitle className="flex flex-wrap items-center gap-2 pr-6 text-left">
                <Badge variant="secondary" className="shrink-0">
                  {ARTIFACT_KIND_LABEL[artifact.kind]}
                </Badge>
                <span className="min-w-0">{artifact.title}</span>
              </DialogTitle>
            </DialogHeader>

            <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1">
              <Mono className="text-muted-foreground">
                {new Date(artifact.createdAt).toISOString().slice(0, 10)}
              </Mono>
              {artifact.skillName && <Mono className="text-muted-foreground">{artifact.skillName}</Mono>}
              {artifact.tags.map((t) => (
                <Badge key={t} variant="outline">
                  {t}
                </Badge>
              ))}
            </div>

            {/*
              「下次会怎么做」摆在两栏之上：整理稿和原话都是「当时发生了什么」，
              只有这一句是**将来用得上的**。它也是这段经历长到第三层的凭据
            */}
            {artifact.takeaway && (
              <div className="shrink-0 rounded-lg border bg-muted/40 px-3 py-2">
                <Mono className="mb-0.5 block text-muted-foreground">下次会怎么做</Mono>
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{artifact.takeaway}</p>
              </div>
            )}

            {hasQa ? (
              <Tabs defaultValue="content" className="flex min-h-0 flex-1 flex-col gap-2">
                <TabsList className="shrink-0 self-start">
                  <TabsTrigger value="content">整理稿</TabsTrigger>
                  <TabsTrigger value="qa">原话 {qa.length} 组</TabsTrigger>
                </TabsList>

                {/* 这一句是这个组件存在的理由，别把它收进折叠区 */}
                <p className="shrink-0 text-xs leading-relaxed text-muted-foreground">
                  <strong className="font-medium text-foreground">原话是你说的，整理稿是 AI 把它串起来的。</strong>
                  两边对不上，以原话为准。
                </p>

                <TabsContent value="content" className="min-h-0 flex-1 overflow-y-auto">
                  <Prose text={artifact.content} />
                </TabsContent>

                <TabsContent value="qa" className="min-h-0 flex-1 overflow-y-auto">
                  <div className="flex flex-col gap-4">
                    {qa.map((pair, i) => (
                      <div key={i} className="flex flex-col gap-1">
                        {/* 问题是 AI 的，答案是学生的——所以答案该是视觉上重的那个 */}
                        <p className="text-xs leading-relaxed text-muted-foreground">{pair.question}</p>
                        <p className="border-l-2 pl-3 text-sm leading-relaxed whitespace-pre-wrap">{pair.answer}</p>
                      </div>
                    ))}
                  </div>
                </TabsContent>
              </Tabs>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col gap-2">
                {artifact.kind === 'reflection' && (
                  // 反思没有底稿是有信息量的：说明它不是访谈出来的，
                  // 没有「哪句是我说的」这一层可查。如实说，不要装作有
                  <p className="shrink-0 text-xs text-muted-foreground">这份反思没有访谈底稿，下面就是全部内容。</p>
                )}
                <div className="min-h-0 flex-1 overflow-y-auto">
                  <Prose text={artifact.content} />
                </div>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

/**
 * 正文按**纯文本**渲染，不按 markdown。
 *
 * 和商店「装之前看正文」同一个理由：这是准备喂给模型、或者由模型串出来的文本，
 * 不该在阅读时就自动获得排版特权。学生要看的是字，不是效果。
 */
function Prose({ text }: { text: string }) {
  return <p className="text-sm leading-relaxed whitespace-pre-wrap">{text}</p>
}
