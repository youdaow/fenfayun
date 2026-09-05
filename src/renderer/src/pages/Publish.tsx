import { useEffect, useMemo, useState } from 'react'
import { api, formatDuration, formatSize } from '../lib/api'
import { Button, Card, Input, Textarea, Field, Badge } from '../components/ui'
import { PlatformAvatar } from '../components/PlatformIcon'
import { PLATFORM_MAP } from '../../../shared/platforms'
import type { AccountRow, PlatformOverrides, TaskRow } from '../../../shared/types'

interface Props {
  preset?: { path: string; name: string } | null
  /** 传入草稿任务时进入草稿编辑模式 */
  editTask?: TaskRow | null
  onExitEdit?: () => void
}

interface OverrideForm {
  title: string
  desc: string
  tags: string
}

export default function Publish({ preset, editTask, onExitEdit }: Props) {
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
  const [platformSchedule, setPlatformSchedule] = useState(false)
  const [selected, setSelected] = useState<number[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [overrides, setOverrides] = useState<PlatformOverrides>({})
  const [overrideOpen, setOverrideOpen] = useState<string | null>(null)

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

  // 草稿编辑模式：载入既有任务填充表单
  useEffect(() => {
    if (!editTask) return
    setTitle(editTask.title)
    setDesc(editTask.description ?? '')
    try {
      setTagText((JSON.parse(editTask.tags || '[]') as string[]).join(' '))
    } catch {
      setTagText('')
    }
    setVideoPath(editTask.video_path)
    setCoverPath(editTask.cover_path ?? '')
    setMode(editTask.publish_mode)
    setScheduledAt(editTask.scheduled_at ? editTask.scheduled_at.replace(' ', 'T').slice(0, 16) : '')
    setPlatformSchedule(!!editTask.platform_schedule)
    try {
      setOverrides(JSON.parse(editTask.overrides || '{}') as PlatformOverrides)
    } catch {
      setOverrides({})
    }
    try {
      const targets = JSON.parse(editTask.targets || '[]') as { accountId: number }[]
      setSelected(targets.map((x) => x.accountId))
    } catch {
      setSelected([])
    }
    void api().statFile(editTask.video_path).then((s) => {
      if (s) {
        setVideoName(s.name)
        setVideoSize(s.size)
        setVideoDur(s.duration)
      }
    })
  }, [editTask])

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

  const grouped = useMemo(
    () =>
      accounts.reduce<Record<string, AccountRow[]>>((acc, a) => {
        ;(acc[a.platform] ??= []).push(a)
        return acc
      }, {}),
    [accounts]
  )

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
  const allSupportSchedule =
    platformsUsed.length > 0 && platformsUsed.every((p) => PLATFORM_MAP[p]?.supportSchedule)

  const setOverride = (platform: string, form: OverrideForm): void => {
    setOverrides((o) => {
      const next = { ...o }
      const tagArr = form.tags
        .split(/[\s,，#]+/)
        .map((t) => t.trim())
        .filter(Boolean)
      if (!form.title.trim() && !form.desc.trim() && !tagArr.length) delete next[platform]
      else next[platform] = { title: form.title.trim(), description: form.desc, tags: tagArr }
      return next
    })
  }

  const submit = async (asDraft: boolean): Promise<void> => {
    if (!videoPath) return alert('请先选择视频文件')
    if (!title.trim()) return alert('请填写标题')
    if (!selected.length) return alert('请至少选择一个账号')

    setSubmitting(true)
    try {
      const common = {
        title: title.trim(),
        description: desc.trim(),
        tags,
        videoPath,
        coverPath: coverPath || undefined,
        publishMode: mode,
        scheduledAt: mode === 'scheduled' ? scheduledAt.replace('T', ' ') : null,
        targets: selectedAccounts.map((a) => ({ platform: a.platform, accountId: a.id })),
        platformSchedule: mode === 'scheduled' && platformSchedule && allSupportSchedule,
        overrides
      }
      if (editTask) {
        // 草稿：先保存字段，再决定继续存草稿还是直接发布
        await api().updateTask(editTask.id, { ...common, coverPath: common.coverPath ?? null })
        if (!asDraft) {
          await api().startDraft(editTask.id)
          alert('草稿已提交发布')
        } else {
          alert('草稿已保存')
        }
        onExitEdit?.()
      } else {
        await api().createTask({ ...common, asDraft })
        alert(
          asDraft
            ? '草稿已保存，可在「任务队列 → 草稿」里继续编辑或直接发布'
            : mode === 'now'
              ? '已加入发布队列，浏览器窗口会依次弹出'
              : '定时任务已创建，到点自动发布'
        )
        setTitle('')
        setDesc('')
        setTagText('')
        setSelected([])
        setOverrides({})
        setOverrideOpen(null)
      }
    } catch (e) {
      alert((e as Error).message ?? '操作失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="grid grid-cols-5 gap-4">
      {/* 左侧：内容 */}
      <div className="col-span-3 space-y-4">
        <Card
          title={editTask ? '编辑草稿' : '视频内容'}
          extra={
            editTask ? (
              <Button size="sm" variant="ghost" onClick={() => onExitEdit?.()}>
                退出编辑
              </Button>
            ) : undefined
          }
        >
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
              hint={
                platformsUsed.length
                  ? '已选平台最短限制 ' + minTitle + ' 字（当前 ' + title.length + '）'
                  : ''
              }
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

        {/* 平台差异化文案 */}
        {platformsUsed.length > 0 && (
          <Card
            title="平台专属文案（可选）"
            extra={<span className="text-[11px] text-ink-400">不填则用上面的通用文案</span>}
          >
            <div className="space-y-2">
              {platformsUsed.map((p) => {
                const meta = PLATFORM_MAP[p]
                const ov = overrides[p]
                return (
                  <div key={p} className="rounded-lg bg-ink-900/60">
                    <button
                      className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
                      onClick={() => setOverrideOpen(overrideOpen === p ? null : p)}
                    >
                      <PlatformAvatar platform={p} size={20} />
                      <span className="text-xs text-ink-200">{meta?.name ?? p}</span>
                      {ov ? (
                        <Badge tone="blue">已定制</Badge>
                      ) : (
                        <span className="text-[11px] text-ink-500">用通用文案</span>
                      )}
                      <span className="ml-auto text-[11px] text-ink-400">
                        {overrideOpen === p ? '收起 ▲' : '定制 ▼'}
                      </span>
                    </button>
                    {overrideOpen === p && (
                      <OverrideEditor
                        platformName={meta?.name ?? p}
                        base={{ title, desc, tags: tagText }}
                        value={ov}
                        onSave={(form) => setOverride(p, form)}
                      />
                    )}
                  </div>
                )
              })}
            </div>
          </Card>
        )}
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
                        className={
                          'flex h-4 w-4 items-center justify-center rounded border text-[10px] ' +
                          (allIn ? 'border-brand-500 bg-brand-600 text-white' : 'border-ink-500')
                        }
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
                            className={
                              'ml-auto text-[10px] ' + (a.is_logged_in ? 'text-emerald-400' : 'text-ink-500')
                            }
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
                className={
                  'rounded-lg border px-3 py-2.5 text-xs transition-colors ' +
                  (mode === 'now'
                    ? 'border-brand-500 bg-brand-500/10 text-ink-100'
                    : 'border-ink-600 text-ink-400 hover:border-ink-500')
                }
              >
                立即发布
              </button>
              <button
                onClick={() => setMode('scheduled')}
                className={
                  'rounded-lg border px-3 py-2.5 text-xs transition-colors ' +
                  (mode === 'scheduled'
                    ? 'border-brand-500 bg-brand-500/10 text-ink-100'
                    : 'border-ink-600 text-ink-400 hover:border-ink-500')
                }
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
                {platformsUsed.length > 0 && !allSupportSchedule && (
                  <p className="mt-2 rounded-lg bg-amber-500/10 p-2 text-[11px] leading-relaxed text-amber-300">
                    所选平台中有不支持平台内定时的，将由本工具到点自动发起；
                    本工具需保持运行（建议在设置中开启托盘常驻与开机自启）。
                  </p>
                )}
                {allSupportSchedule && (
                  <label className="mt-2 flex cursor-pointer items-start gap-2 rounded-lg bg-ink-800 p-2.5">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-3.5 w-3.5 accent-brand-500"
                      checked={platformSchedule}
                      onChange={(e) => setPlatformSchedule(e.target.checked)}
                    />
                    <span className="text-[11px] leading-relaxed text-ink-300">
                      交给平台侧定时发布（推荐）：内容提前上传并挂到平台自己的定时器上，
                      关闭本工具也能准时发布。
                    </span>
                  </label>
                )}
                <p className="mt-2 text-[11px] leading-relaxed text-ink-400">
                  未勾选时由本工具到点自动拉起浏览器提交；关机期间错过的任务会在下次启动时补发。
                </p>
              </Field>
            )}

            <div className="rounded-lg bg-ink-800 p-3 text-[11px] leading-relaxed text-ink-400">
              本次将创建 <span className="text-ink-200">{selected.length}</span> 条发布记录，覆盖{' '}
              <span className="text-ink-200">{platformsUsed.length}</span> 个平台。
              发布过程中请勿关闭弹出的浏览器窗口；遇到验证码请在浏览器里手动完成。
            </div>

            <div className="flex gap-2">
              <Button
                variant="primary"
                className="flex-1"
                disabled={submitting || !selected.length}
                onClick={() => void submit(false)}
              >
                {submitting ? '提交中…' : mode === 'now' ? '开始发布' : '创建定时任务'}
              </Button>
              <Button variant="soft" disabled={submitting} onClick={() => void submit(true)}>
                存为草稿
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}

/** 单平台文案覆盖编辑器 */
function OverrideEditor({
  platformName,
  base,
  value,
  onSave
}: {
  platformName: string
  base: { title: string; desc: string; tags: string }
  value?: { title?: string; description?: string; tags?: string[] }
  onSave: (form: OverrideForm) => void
}) {
  const [form, setForm] = useState<OverrideForm>({
    title: value?.title ?? '',
    desc: value?.description ?? '',
    tags: value?.tags?.join(' ') ?? ''
  })
  return (
    <div className="space-y-3 border-t border-ink-800 px-3 py-3">
      <Field label={platformName + ' 标题'} hint="留空沿用通用标题">
        <Input
          value={form.title}
          placeholder={base.title || '通用标题'}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
        />
      </Field>
      <Field label="简介" hint="留空沿用通用简介">
        <Textarea
          rows={3}
          value={form.desc}
          placeholder={base.desc || '通用简介'}
          onChange={(e) => setForm((f) => ({ ...f, desc: e.target.value }))}
        />
      </Field>
      <Field label="话题" hint="留空沿用通用话题">
        <Input
          value={form.tags}
          placeholder={base.tags || '通用话题'}
          onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
        />
      </Field>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={() => onSave({ title: '', desc: '', tags: '' })}>
          清除该平台的定制
        </Button>
        <Button size="sm" variant="primary" onClick={() => onSave(form)}>
          保存定制
        </Button>
      </div>
    </div>
  )
}
