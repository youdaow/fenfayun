import { useEffect, useState } from 'react'
import { api, formatDuration, formatSize } from '../lib/api'
import { Button, Card, Input, Textarea, Field, Badge } from '../components/ui'
import { PlatformAvatar } from '../components/PlatformIcon'
import { PLATFORM_MAP } from '../../../shared/platforms'
import type { AccountRow } from '../../../shared/types'

interface Props {
  preset?: { path: string; name: string } | null
}

export default function Publish({ preset }: Props) {
  const [accounts, setAccounts] = useState<AccountRow[]>([])
  const [videoPath, setVideoPath] = useState('')
  const [videoName, setVideoName] = useState('')
  const [videoSize, setVideoSize] = useState(0)
  const [videoDur, setVideoDur] = useState<number | null>(null)
  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')
  const [tagText, setTagText] = useState('')
  const [coverPath, setCoverPath] = useState('')
  const [mode, setMode] = useState<'now' | 'scheduled'>('now')
  const [scheduledAt, setScheduledAt] = useState('')
  const [selected, setSelected] = useState<number[]>([])
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    void api().getAccounts().then(setAccounts)
  }, [])

  useEffect(() => {
    if (!preset) return
    setVideoPath(preset.path)
    setVideoName(preset.name)
    void api().statFile(preset.path).then((s) => {
      if (s) {
        setVideoSize(s.size)
        setVideoDur(s.duration)
      }
    })
  }, [preset])

  const tags = tagText
    .split(/[\s,，#]+/)
    .map((t) => t.trim())
    .filter(Boolean)

  const pickVideo = async () => {
    const p = await api().selectVideo()
    if (!p) return
    setVideoPath(p)
    const s = await api().statFile(p)
    setVideoName(s?.name ?? p.split(/[\\/]/).pop() ?? p)
    setVideoSize(s?.size ?? 0)
    setVideoDur(s?.duration ?? null)
  }

  const pickCover = async () => {
    const p = await api().selectImage()
    if (p) setCoverPath(p)
  }

  const grouped = accounts.reduce<Record<string, AccountRow[]>>((acc, a) => {
    ;(acc[a.platform] ??= []).push(a)
    return acc
  }, {})

  const toggle = (id: number) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))

  const togglePlatform = (platform: string) => {
    const ids = (grouped[platform] ?? []).map((a) => a.id)
    const allIn = ids.every((i) => selected.includes(i))
    setSelected((s) => (allIn ? s.filter((x) => !ids.includes(x)) : [...new Set([...s, ...ids])]))
  }

  const selectedAccounts = accounts.filter((a) => selected.includes(a.id))
  const platformsUsed = [...new Set(selectedAccounts.map((a) => a.platform))]
  const minTitle = Math.min(...platformsUsed.map((p) => PLATFORM_MAP[p]?.titleMax ?? 100), 100)

  const submit = async () => {
    if (!videoPath) return alert('请先选择视频文件')
    if (!title.trim()) return alert('请填写标题')
    if (!selected.length) return alert('请至少选择一个账号')

    setSubmitting(true)
    try {
      await api().createTask({
        title: title.trim(),
        description: desc.trim(),
        tags,
        videoPath,
        coverPath: coverPath || undefined,
        publishMode: mode,
        scheduledAt: mode === 'scheduled' ? scheduledAt.replace('T', ' ') : null,
        targets: selectedAccounts.map((a) => ({ platform: a.platform, accountId: a.id }))
      })
      alert(mode === 'now' ? '已加入发布队列，浏览器窗口会依次弹出' : '定时任务已创建，到点自动发布')
      setTitle('')
      setDesc('')
      setTagText('')
      setSelected([])
    } catch (e) {
      alert((e as Error).message ?? '创建失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="grid grid-cols-5 gap-4">
      {/* 左侧：内容 */}
      <div className="col-span-3 space-y-4">
        <Card title="视频内容">
          <div className="space-y-4">
            <Field label="视频文件">
              <div
                onClick={pickVideo}
                className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-ink-600 bg-ink-900 px-4 py-5 transition-colors hover:border-brand-500"
              >
                <span className="text-2xl">🎬</span>
                {videoPath ? (
                  <div className="min-w-0">
                    <div className="truncate text-sm text-ink-100">{videoName}</div>
                    <div className="mt-0.5 text-[11px] text-ink-400">
                      {formatSize(videoSize)} · {formatDuration(videoDur)}
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-ink-400">点击选择本地视频（支持 mp4 / mov / mkv 等）</div>
                )}
              </div>
            </Field>

            <Field
              label="标题"
              hint={platformsUsed.length ? `已选平台最短限制 ${minTitle} 字（当前 ${title.length}）` : ''}
            >
              <Input
                value={title}
                maxLength={100}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="一句话说清这条视频"
              />
            </Field>

            <Field label="简介 / 描述">
              <Textarea
                rows={4}
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                placeholder="补充描述，支持多行"
              />
            </Field>

            <Field label="话题标签" hint="空格或逗号分隔，发布时自动转成 #话题">
              <Input
                value={tagText}
                onChange={(e) => setTagText(e.target.value)}
                placeholder="例如：好物分享 日常生活 vlog"
              />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {tags.map((t) => (
                  <Badge key={t} tone="blue">
                    #{t}
                  </Badge>
                ))}
              </div>
            </Field>

            <Field label="封面" hint="选填，不传则各平台自动截取">
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={pickCover}>
                  {coverPath ? '更换封面' : '选择封面图片'}
                </Button>
                <span className="truncate text-[11px] text-ink-400">
                  {coverPath ? coverPath.split(/[\\/]/).pop() : '未选择'}
                </span>
              </div>
            </Field>
          </div>
        </Card>
      </div>

      {/* 右侧：目标与发布设置 */}
      <div className="col-span-2 space-y-4">
        <Card title="发布账号">
          {!accounts.length ? (
            <div className="py-6 text-center text-xs text-ink-400">
              还没有账号，请先到「账号管理」添加并登录
            </div>
          ) : (
            <div className="space-y-4">
              {Object.entries(grouped).map(([platform, list]) => {
                const ids = list.map((a) => a.id)
                const allIn = ids.every((i) => selected.includes(i))
                return (
                  <div key={platform}>
                    <button
                      onClick={() => togglePlatform(platform)}
                      className="mb-2 flex w-full items-center gap-2 rounded-lg px-1 py-1 text-left hover:bg-ink-800"
                    >
                      <span
                        className={`flex h-4 w-4 items-center justify-center rounded border text-[10px] ${
                          allIn ? 'border-brand-500 bg-brand-600 text-white' : 'border-ink-500'
                        }`}
                      >
                        {allIn ? '✓' : ''}
                      </span>
                      <PlatformAvatar platform={platform} size={20} />
                      <span className="text-xs font-medium text-ink-200">
                        {PLATFORM_MAP[platform]?.name ?? platform}
                      </span>
                      <span className="ml-auto text-[11px] text-ink-400">{list.length} 个账号</span>
                    </button>
                    <div className="space-y-1 pl-6">
                      {list.map((a) => (
                        <label
                          key={a.id}
                          className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-ink-800"
                        >
                          <input
                            type="checkbox"
                            className="h-3.5 w-3.5 accent-brand-500"
                            checked={selected.includes(a.id)}
                            onChange={() => toggle(a.id)}
                          />
                          <span className="truncate text-xs text-ink-200">{a.name}</span>
                          <span
                            className={`ml-auto text-[10px] ${
                              a.is_logged_in ? 'text-emerald-400' : 'text-ink-500'
                            }`}
                          >
                            {a.is_logged_in ? '已登录' : '未登录'}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Card>

        <Card title="发布方式">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setMode('now')}
                className={`rounded-lg border px-3 py-2.5 text-xs transition-colors ${
                  mode === 'now'
                    ? 'border-brand-500 bg-brand-500/10 text-ink-100'
                    : 'border-ink-600 text-ink-400 hover:border-ink-500'
                }`}
              >
                立即发布
              </button>
              <button
                onClick={() => setMode('scheduled')}
                className={`rounded-lg border px-3 py-2.5 text-xs transition-colors ${
                  mode === 'scheduled'
                    ? 'border-brand-500 bg-brand-500/10 text-ink-100'
                    : 'border-ink-600 text-ink-400 hover:border-ink-500'
                }`}
              >
                定时发布
              </button>
            </div>

            {mode === 'scheduled' && (
              <Field label="发布时间">
                <Input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                />
                <p className="mt-2 text-[11px] leading-relaxed text-ink-400">
                  定时任务依赖本工具保持运行。到点后自动拉起浏览器提交，关机期间错过的任务会在下次启动时补发。
                </p>
              </Field>
            )}

            <div className="rounded-lg bg-ink-800 p-3 text-[11px] leading-relaxed text-ink-400">
              本次将创建 <span className="text-ink-200">{selected.length}</span> 条发布记录，覆盖{' '}
              <span className="text-ink-200">{platformsUsed.length}</span> 个平台。
              发布过程中请勿关闭弹出的浏览器窗口。
            </div>

            <Button
              variant="primary"
              className="w-full"
              disabled={submitting || !selected.length}
              onClick={submit}
            >
              {submitting ? '提交中…' : mode === 'now' ? '开始发布' : '创建定时任务'}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  )
}
