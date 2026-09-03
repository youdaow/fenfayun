import { useEffect, useState } from 'react'
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

  const load = async () => {
    const rows = await api().getMaterials(kw)
    setList(rows)
    const flags: Record<number, boolean> = {}
    for (const r of rows) flags[r.id] = await api().fileExists(r.path)
    setMissing(Object.fromEntries(Object.entries(flags).map(([k, v]) => [k, !v])))
  }

  useEffect(() => {
    void load()
    return api().onRefresh(() => void load())
  }, [kw])

  const play = async (m: MaterialRow) => {
    const url = await api().materialMediaUrl(m.path)
    if (url) setPreview({ name: m.name, url })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Input
            className="w-64"
            placeholder="搜索素材名称…"
            value={kw}
            onChange={(e) => setKw(e.target.value)}
          />
          <span className="text-xs text-ink-400">共 {list.length} 个</span>
        </div>
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

      {!list.length ? (
        <Card>
          <Empty text="素材库是空的，点「添加素材」把本地视频登记进来" icon="🎬" />
        </Card>
      ) : (
        <div className="grid grid-cols-4 gap-4">
          {list.map((m) => (
            <Card key={m.id} className="overflow-hidden p-0">
              <div
                className="group relative flex h-28 cursor-pointer items-center justify-center bg-ink-800 text-3xl"
                onClick={() => !missing[m.id] && play(m)}
              >
                🎞️
                {!missing[m.id] && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                    <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-600 text-white">
                      ▶
                    </span>
                  </div>
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
