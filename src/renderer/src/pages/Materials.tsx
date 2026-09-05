import { useEffect, useRef, useState } from 'react'
import { api, formatDuration, formatSize } from '../lib/api'
import { Button, Card, Input, Empty, Badge, Modal } from '../components/ui'
import type { MaterialRow } from '../../../shared/types'

export default function Materials({
  onUse
}: {
  onUse?: (m: { path: string; name: string }) => void
}) {
  const [list, setList] = useState<MaterialRow[]>([])
  const [kw, setKw] = useState('')
  const [missing, setMissing] = useState<Record<number, boolean>>({})
  const [preview, setPreview] = useState<{ name: string; url: string } | null>(null)
  const [selectMode, setSelectMode] = useState(false)
  const [picked, setPicked] = useState<number[]>([])
  const [dragOn, setDragOn] = useState(false)
  const dragDepth = useRef(0)

  const load = async () => {
    const rows = await api().getMaterials(kw)
    setList(rows)
    const flags: Record<number, boolean> = {}
    for (const r of rows) flags[r.id] = await api().fileExists(r.path)
    setMissing(Object.fromEntries(Object.entries(flags).map(([k, v]) => [k, !v])))
    setPicked((p) => p.filter((id) => rows.some((r) => r.id === id)))
  }

  useEffect(() => {
    void load()
    return api().onRefresh(() => void load())
  }, [kw])

  const importPaths = async (paths: string[]) => {
    if (!paths.length) return
    const created = await api().addMaterialPaths(paths, false)
    if (created.length) void load()
    else if (paths.length) alert('没有新视频被登记（可能不是视频文件或已存在）')
  }

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    dragDepth.current = 0
    setDragOn(false)
    const files = Array.from(e.dataTransfer.files || [])
    if (!files.length) return
    const paths: string[] = []
    for (const f of files) {
      const p = window.getPathForFile?.(f) || (f as File & { path?: string }).path || ''
      if (p) paths.push(p)
    }
    await importPaths(paths)
  }

  const play = async (m: MaterialRow) => {
    const url = await api().materialMediaUrl(m.path)
    if (url) setPreview({ name: m.name, url })
  }

  const togglePick = (id: number) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))

  return (
    <div
      className="space-y-4"
      onDragEnter={(e) => {
        e.preventDefault()
        dragDepth.current += 1
        setDragOn(true)
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={() => {
        dragDepth.current -= 1
        if (dragDepth.current <= 0) setDragOn(false)
      }}
      onDrop={(e) => void onDrop(e)}
    >
      {dragOn && (
        <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="rounded-2xl border-2 border-dashed border-brand-400 bg-ink-850/90 px-12 py-10 text-center">
            <div className="text-4xl">🎬</div>
            <div className="mt-3 text-sm font-medium text-ink-100">松开即登记进素材库</div>
            <div className="mt-1 text-[11px] text-ink-400">支持 mp4 / mov / mkv / avi / webm 等</div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Input
            className="w-64"
            placeholder="搜索素材名称…"
            value={kw}
            onChange={(e) => setKw(e.target.value)}
          />
          <span className="text-xs text-ink-400">共 {list.length} 个</span>
          {selectMode && picked.length > 0 && (
            <>
              <span className="text-xs text-brand-300">已选 {picked.length}</span>
              <Button
                size="sm"
                variant="danger"
                onClick={async () => {
                  if (!confirm('从素材库移除选中的 ' + picked.length + ' 个素材？（不会删除本地文件）')) return
                  await api().removeMaterials(picked)
                  setPicked([])
                  setSelectMode(false)
                  void load()
                }}
              >
                移除所选
              </Button>
            </>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant={selectMode ? 'primary' : 'soft'}
            onClick={() => {
              setSelectMode((s) => !s)
              setPicked([])
            }}
          >
            {selectMode ? '退出多选' : '多选'}
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={async () => {
              await api().pickMaterial(false)
              void load()
            }}
          >
            + 添加素材
          </Button>
        </div>
      </div>

      {!list.length ? (
        <Card>
          <Empty text="素材库是空的：点「添加素材」或直接把视频文件拖进来" icon="🎬" />
        </Card>
      ) : (
        <div className="grid grid-cols-4 gap-4">
          {list.map((m) => (
            <Card key={m.id} className={`overflow-hidden p-0 ${selectMode && picked.includes(m.id) ? 'ring-2 ring-brand-500' : ''}`}>
              <div
                className="group relative flex h-28 cursor-pointer items-center justify-center bg-ink-800 text-3xl"
                onClick={() => (selectMode ? togglePick(m.id) : !missing[m.id] && play(m))}
              >
                🎞️
                {selectMode ? (
                  <span
                    className={
                      'absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded border text-[11px] ' +
                      (picked.includes(m.id) ? 'border-brand-500 bg-brand-600 text-white' : 'border-ink-500 bg-ink-900/70')
                    }
                  >
                    {picked.includes(m.id) ? '✓' : ''}
                  </span>
                ) : (
                  !missing[m.id] && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-600 text-white">
                        ▶
                      </span>
                    </div>
                  )
                )}
              </div>
              <div className="space-y-2 p-4">
                <div className="truncate text-sm font-medium text-ink-100" title={m.name}>
                  {m.name}
                </div>
                <div className="flex items-center gap-2 text-[11px] text-ink-400">
                  <span>{formatSize(m.size)}</span>
                  <span>·</span>
                  <span>{formatDuration(m.duration)}</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {missing[m.id] ? (
                    <Badge tone="red">文件已丢失</Badge>
                  ) : (
                    <Badge tone="green">文件正常</Badge>
                  )}
                </div>
                {!selectMode && (
                  <div className="flex gap-2 pt-1">
                    <Button
                      size="sm"
                      variant="primary"
                      disabled={missing[m.id]}
                      onClick={() => onUse?.({ path: m.path, name: m.name })}
                    >
                      去发布
                    </Button>
                    <Button size="sm" variant="ghost" disabled={missing[m.id]} onClick={() => play(m)}>
                      预览
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => api().openInFolder(m.path)}>
                      打开位置
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="ml-auto text-red-400 hover:bg-red-500/10"
                      onClick={async () => {
                        if (confirm('从素材库移除？（不会删除本地文件）')) {
                          await api().removeMaterial(m.id)
                          void load()
                        }
                      }}
                    >
                      移除
                    </Button>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* 视频预览弹窗 */}
      <Modal
        open={!!preview}
        title={preview?.name ?? ''}
        onClose={() => setPreview(null)}
        width="max-w-3xl"
      >
        {preview && (
          <video
            key={preview.url}
            src={preview.url}
            controls
            autoPlay
            className="max-h-[60vh] w-full rounded-lg bg-black"
          />
        )}
      </Modal>
    </div>
  )
}
