'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import styles from './teacher.module.css'

/* ── Types ── */
interface Subject { id: string; name: string }
interface StageItem { type: 'q' | 'd'; content: string }
interface Stage { title: string; items: StageItem[] }
interface Project { id: string; subject_id: string; title: string; description: string; stages: Stage[] }
interface SubmissionFile { id: number; file_name: string; file_path: string; file_size: string; uploaded_at: string }
interface Submission {
  id: number; year: number; grade: number; cls: number; no: number;
  student_id: string; student_name: string; subject_id: string; subject_name: string;
  project_id: string; project_title: string; submitted_at: string | null; submitted: boolean;
}
interface MediaItem { type: 'video' | 'image' | 'embed'; url: string; caption: string }
interface Forum { id: string; subject_id: string | null; title: string; description: string; media_items: MediaItem[]; is_active: boolean; layout_media: number; layout_comment: number; comment_height: number; anonymous: boolean; password: string; notice: string }

const SUBJECT_ICONS = ['📖','🔬','🎨','🌍','💻','🎵','⚽','📐','🧬','📝']

export default function TeacherDashboard() {
  const router = useRouter()
  const supabase = createClient()
  const [teacher, setTeacher] = useState('')
  const [dashTab, setDashTab] = useState<'submissions' | 'guidelines' | 'forums'>('submissions')

  // Data
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [submissions, setSubmissions] = useState<Submission[]>([])

  // Guidelines state
  const [currentSubjectId, setCurrentSubjectId] = useState<string | null>(null)
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null)
  const [newSubjectName, setNewSubjectName] = useState('')
  const [newProjName, setNewProjName] = useState('')
  const [editorTitle, setEditorTitle] = useState('')
  const [editorDesc, setEditorDesc] = useState('')
  const [editorStages, setEditorStages] = useState<Stage[]>([])
  const [glView, setGlView] = useState<'sidebar' | 'projlist' | 'editor'>('sidebar')
  const [previewOpen, setPreviewOpen] = useState(false)
  const [toast, setToast] = useState('')
  const [toastVisible, setToastVisible] = useState(false)

  // Submissions filter
  const [fYear, setFYear] = useState(new Date().getFullYear())
  const [fGrade, setFGrade] = useState('')
  const [fClass, setFClass] = useState('')
  const [fSubject, setFSubject] = useState('')
  const [fProject, setFProject] = useState('')
  const [fStatus, setFStatus] = useState('')
  const [filteredSubs, setFilteredSubs] = useState<Submission[]>([])
  const [searched, setSearched] = useState(false)

  // File dropdown
  const [fileDropdownId, setFileDropdownId] = useState<number | null>(null)
  const [fileDropdownData, setFileDropdownData] = useState<SubmissionFile[]>([])
  const [fileDropdownLoading, setFileDropdownLoading] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Forum state
  const [forums, setForums] = useState<Forum[]>([])
  const [forumView, setForumView] = useState<'list' | 'editor'>('list')
  const [currentForumId, setCurrentForumId] = useState<string | null>(null)
  const [fTitle, setFTitle] = useState('')
  const [fDesc, setFDesc] = useState('')
  const [fSubjectId, setFSubjectId] = useState('')
  const [fActive, setFActive] = useState(true)
  const [fMediaItems, setFMediaItems] = useState<MediaItem[]>([])
  const [newMediaUrl, setNewMediaUrl] = useState('')
  const [newMediaType, setNewMediaType] = useState<'video' | 'image' | 'embed'>('video')
  const [newMediaCaption, setNewMediaCaption] = useState('')
  const [copiedLink, setCopiedLink] = useState<string | null>(null)
  // 레이아웃 설정 (미디어 비율 %, 댓글창 높이 px)
  const [fLayoutMedia, setFLayoutMedia] = useState(62)
  const [fCommentHeight, setFCommentHeight] = useState(70)
  const [fAnonymous, setFAnonymous] = useState(false)
  const [fPassword, setFPassword] = useState('')
  const [fNotice, setFNotice] = useState('')

  /* ── Auth guard ── */
  useEffect(() => {
    const t = sessionStorage.getItem('ph_teacher')
    if (!t) { router.replace('/'); return }
    setTeacher(t)
  }, [router])

  /* ── Close dropdown on outside click ── */
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setFileDropdownId(null)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  /* ── Load data ── */
  const loadData = useCallback(async () => {
    const [{ data: subs }, { data: projs }, { data: sbms }, { data: frms }] = await Promise.all([
      supabase.from('subjects').select('*').order('created_at'),
      supabase.from('projects').select('*').order('created_at'),
      supabase.from('submissions').select('*').order('created_at'),
      supabase.from('forums').select('*').order('created_at'),
    ])
    if (subs) setSubjects(subs)
    if (projs) setProjects(projs)
    if (sbms) setSubmissions(sbms)
    if (frms) setForums(frms)
  }, [supabase])

  useEffect(() => { if (teacher) loadData() }, [teacher, loadData])

  /* ── Toast ── */
  function showToast(msg: string) {
    setToast(msg)
    setToastVisible(true)
    setTimeout(() => setToastVisible(false), 2200)
  }

  /* ── Subject CRUD ── */
  async function addSubject() {
    const name = newSubjectName.trim()
    if (!name) return
    const id = 'subj_' + Date.now()
    const { error } = await supabase.from('subjects').insert({ id, name })
    if (!error) { setSubjects(prev => [...prev, { id, name }]); setNewSubjectName('') }
  }

  async function deleteSubject(id: string) {
    if (!confirm('과목과 모든 프로젝트를 삭제할까요?')) return
    await supabase.from('subjects').delete().eq('id', id)
    setSubjects(prev => prev.filter(s => s.id !== id))
    setProjects(prev => prev.filter(p => p.subject_id !== id))
    if (currentSubjectId === id) { setCurrentSubjectId(null); setCurrentProjectId(null); setGlView('sidebar') }
  }

  /* ── Project CRUD ── */
  async function addProject() {
    const title = newProjName.trim()
    if (!title || !currentSubjectId) return
    const id = 'proj_' + Date.now()
    const { error } = await supabase.from('projects').insert({ id, subject_id: currentSubjectId, title, description: '', stages: [] })
    if (!error) {
      setProjects(prev => [...prev, { id, subject_id: currentSubjectId!, title, description: '', stages: [] }])
      setNewProjName('')
    }
  }

  async function deleteProject(id: string) {
    if (!confirm('프로젝트를 삭제할까요?')) return
    await supabase.from('projects').delete().eq('id', id)
    setProjects(prev => prev.filter(p => p.id !== id))
    if (currentProjectId === id) { setCurrentProjectId(null); setGlView('projlist') }
  }

  /* ── Editor ── */
  function openEditor(projId: string) {
    const proj = projects.find(p => p.id === projId)
    if (!proj) return
    setCurrentProjectId(projId)
    setEditorTitle(proj.title)
    setEditorDesc(proj.description)
    setEditorStages(JSON.parse(JSON.stringify(proj.stages)))
    setGlView('editor')
  }

  async function saveGuideline() {
    if (!currentProjectId) return
    const { error } = await supabase.from('projects').update({
      title: editorTitle, description: editorDesc, stages: editorStages
    }).eq('id', currentProjectId)
    if (!error) {
      setProjects(prev => prev.map(p => p.id === currentProjectId
        ? { ...p, title: editorTitle, description: editorDesc, stages: editorStages } : p))
      showToast('✅ 가이드라인이 저장되었습니다.')
    }
  }

  function addStage() {
    setEditorStages(prev => [...prev, { title: '', items: [] }])
  }
  function deleteStage(i: number) {
    setEditorStages(prev => prev.filter((_, idx) => idx !== i))
  }
  function moveStage(i: number, dir: -1 | 1) {
    const arr = [...editorStages]
    const j = i + dir
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]]
    setEditorStages(arr)
  }
  function updateStageTitle(i: number, val: string) {
    setEditorStages(prev => prev.map((s, idx) => idx === i ? { ...s, title: val } : s))
  }
  function addItem(si: number, type: 'q' | 'd') {
    setEditorStages(prev => prev.map((s, idx) => idx === si ? { ...s, items: [...s.items, { type, content: '' }] } : s))
  }
  function deleteItem(si: number, ii: number) {
    setEditorStages(prev => prev.map((s, idx) => idx === si ? { ...s, items: s.items.filter((_, iii) => iii !== ii) } : s))
  }
  function updateItem(si: number, ii: number, content: string) {
    setEditorStages(prev => prev.map((s, idx) => idx === si
      ? { ...s, items: s.items.map((it, iii) => iii === ii ? { ...it, content } : it) } : s))
  }

  /* ── Submissions filter ── */
  function searchSubmissions() {
    let filtered = submissions.filter(s => s.year === fYear)
    if (fGrade) filtered = filtered.filter(s => String(s.grade) === fGrade)
    if (fClass) filtered = filtered.filter(s => String(s.cls) === fClass)
    if (fSubject) filtered = filtered.filter(s => s.subject_id === fSubject)
    if (fProject) filtered = filtered.filter(s => s.project_id === fProject)
    if (fStatus === 'submitted') filtered = filtered.filter(s => s.submitted)
    if (fStatus === 'none') filtered = filtered.filter(s => !s.submitted)
    setFilteredSubs(filtered)
    setSearched(true)
  }

  /* ── Download: HTML 보고서 생성 ── */
  function escHtml(str: string) {
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
  }

  async function buildReportHtml(s: Submission) {
    const subj = subjects.find(sub => sub.id === s.subject_id)
    const proj = projects.find(p => p.id === s.project_id)

    // answers는 submissions 테이블에 이미 있음
    const { data } = await supabase.from('submissions')
      .select('answers').eq('id', s.id).single()
    const answers: Record<string, string> = data?.answers || {}

    const stages = proj?.stages || []
    const totalItems = stages.reduce((n: number, st: Stage) => n + st.items.length, 0)
    const answeredItems = Object.values(answers).filter(v => v && (v as string).trim()).length
    const pct = totalItems > 0 ? Math.round(answeredItems / totalItems * 100) : 0
    const subjName = subj?.name || s.subject_name
    const projTitle = proj?.title || s.project_title
    const projDesc = proj?.description || ''

    const stagesHtml = stages.map((st: Stage, si: number) => {
      const itemsHtml = st.items.map((item: StageItem, ii: number) => {
        const key = `${si}_${ii}`
        const ans = (answers[key] || '').trim()
        const isQ = item.type === 'q'
        const badgeColor = isQ ? '#3B5BDB' : '#E67700'
        const badgeBg = isQ ? '#EEF3FF' : '#FFF3E0'
        return `<div style="margin-bottom:1.25rem;">
          <div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:8px;">
            <span style="flex-shrink:0;font-size:0.65rem;font-weight:700;padding:2px 8px;border-radius:12px;background:${badgeBg};color:${badgeColor};margin-top:2px;">${isQ ? '질문' : '설명'}</span>
            <span style="font-size:0.9rem;font-weight:600;color:#1A1814;line-height:1.5;">${escHtml(item.content || '')}</span>
          </div>
          <div style="margin-left:38px;padding:0.7rem 1rem;background:${ans ? '#F8F7F4' : '#FAFAFA'};border:1.5px solid ${ans ? '#D8D4CC' : '#EBEBEB'};border-radius:10px;font-size:0.88rem;color:${ans ? '#1A1814' : '#AAAAAA'};line-height:1.7;white-space:pre-wrap;min-height:44px;">${ans ? escHtml(ans) : '(미작성)'}</div>
        </div>`
      }).join('')
      return `<div style="margin-bottom:1.25rem;border:1.5px solid #E4E0D8;border-radius:14px;overflow:hidden;">
        <div style="display:flex;align-items:center;gap:10px;padding:0.85rem 1.1rem;background:#FDFCFB;border-bottom:1px solid #E4E0D8;">
          <div style="width:28px;height:28px;border-radius:9px;background:#2D5A3D;color:white;font-size:0.72rem;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${si + 1}</div>
          <span style="font-size:0.95rem;font-weight:700;color:#1A1814;">${escHtml(st.title || `${si + 1}단계`)}</span>
        </div>
        <div style="padding:1.1rem 1.1rem 0.1rem;">${itemsHtml}</div>
      </div>`
    }).join('')

    return `<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8">
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;700&family=DM+Serif+Display&display=swap" rel="stylesheet">
<title>${escHtml(subjName)} · ${escHtml(projTitle)} — ${escHtml(s.student_name)} 제출보고서</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Noto Sans KR',sans-serif;background:#F7F5F0;padding:1.5rem 1rem;color:#1A1814;}.page{max-width:720px;margin:0 auto;}.report-header{background:white;border:1.5px solid #E4E0D8;border-radius:14px;padding:1rem 1.25rem;margin-bottom:1.25rem;box-shadow:0 2px 8px rgba(0,0,0,0.05);}.header-top{display:flex;align-items:center;gap:8px;margin-bottom:0.45rem;}.subj-badge{display:inline-block;background:#EAF3DE;color:#2D5A3D;font-size:0.65rem;font-weight:700;padding:2px 8px;border-radius:20px;flex-shrink:0;}.proj-title{font-size:1.1rem;font-weight:700;color:#1A1814;}.proj-desc{font-size:0.8rem;color:#6B6760;line-height:1.5;margin-bottom:0.55rem;}.meta-row{display:flex;align-items:center;gap:0;flex-wrap:wrap;border-top:1px solid #F0EDE6;padding-top:0.55rem;margin-top:0.1rem;}.meta-item{display:flex;align-items:center;gap:5px;padding:0 0.9rem 0 0;}.meta-item:not(:last-child){border-right:1px solid #E4E0D8;margin-right:0.9rem;}.meta-label{font-size:0.65rem;font-weight:700;color:#A8A49E;letter-spacing:0.05em;text-transform:uppercase;}.meta-value{font-size:0.82rem;font-weight:600;color:#1A1814;}.progress-row{margin-top:0.55rem;padding-top:0.55rem;border-top:1px solid #F0EDE6;display:flex;align-items:center;gap:0.75rem;}.progress-label{font-size:0.72rem;color:#6B6760;white-space:nowrap;}.progress-bar{flex:1;height:5px;background:#E4E0D8;border-radius:6px;overflow:hidden;}.progress-fill{height:100%;background:#2D5A3D;border-radius:6px;}.progress-pct{font-size:0.72rem;color:#2D5A3D;font-weight:700;white-space:nowrap;}.print-footer{text-align:center;font-size:0.72rem;color:#A8A49E;margin-top:1.5rem;padding-top:0.75rem;border-top:1px solid #E4E0D8;}@media print{*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;}body{background:#F7F5F0!important;}.no-print{display:none!important;}}</style>
</head><body><div class="page">
  <div class="report-header">
    <div class="header-top">
      <span class="subj-badge">${escHtml(subjName)}</span>
      <span class="proj-title">${escHtml(projTitle)}</span>
    </div>
    ${projDesc ? `<div class="proj-desc">${escHtml(projDesc)}</div>` : ''}
    <div class="meta-row">
      <div class="meta-item"><span class="meta-label">학생</span><span class="meta-value">${escHtml(s.student_name)}</span></div>
      <div class="meta-item"><span class="meta-label">학번</span><span class="meta-value">${escHtml(s.student_id)}</span></div>
      <div class="meta-item"><span class="meta-label">과목</span><span class="meta-value">${escHtml(subjName)}</span></div>
      <div class="meta-item" style="border-right:none;margin-right:0;padding-right:0;"><span class="meta-label">제출</span><span class="meta-value">${escHtml(s.submitted_at || '—')}</span></div>
    </div>
    <div class="progress-row">
      <span class="progress-label">답변 완성도</span>
      <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
      <span class="progress-pct">${answeredItems}/${totalItems} (${pct}%)</span>
    </div>
  </div>
  <div>${stagesHtml || '<div style="text-align:center;padding:3rem;color:#A8A49E;">가이드라인 정보가 없습니다.</div>'}</div>
  <div class="print-footer">ProjectHub · ${escHtml(subjName)} › ${escHtml(projTitle)} · ${escHtml(s.student_name)} (${escHtml(s.student_id)}) · ${escHtml(s.submitted_at || '')}</div>
</div>
<div class="no-print" style="position:fixed;bottom:1.5rem;right:1.5rem;display:flex;gap:0.5rem;">
  <button onclick="window.print()" style="padding:0.5rem 1rem;background:#1A1814;color:white;border:none;border-radius:9px;font-size:0.82rem;font-family:'Noto Sans KR',sans-serif;font-weight:700;cursor:pointer;">🖨 인쇄하기</button>
  <button onclick="window.close()" style="padding:0.5rem 1rem;background:white;color:#6B6760;border:1.5px solid #E4E0D8;border-radius:9px;font-size:0.82rem;font-family:'Noto Sans KR',sans-serif;cursor:pointer;">✕ 닫기</button>
</div>
</body></html>`
  }

  function triggerDownload(html: string, filename: string) {
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = filename
    document.body.appendChild(a); a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  async function downloadSingle(s: Submission) {
    // 워크시트 HTML 다운로드
    const html = await buildReportHtml(s)
    const filename = `${s.student_id}_${s.student_name}_${s.subject_name}_${s.project_title}.html`
      .replace(/[\\/:*?"<>|]/g, '_')
    triggerDownload(html, filename)
    showToast(`📥 ${s.student_name} 보고서를 다운로드했습니다.`)
  }

  async function toggleFileDropdown(s: Submission) {
    if (fileDropdownId === s.id) { setFileDropdownId(null); return }
    setFileDropdownId(s.id)
    setFileDropdownLoading(true)
    setFileDropdownData([])
    const { data } = await supabase.from('submission_files')
      .select('id, file_name, file_path, file_size, uploaded_at')
      .eq('student_id', s.student_id).eq('project_id', s.project_id)
      .order('uploaded_at')
    setFileDropdownData(data || [])
    setFileDropdownLoading(false)
  }

  async function downloadStudentFile(file: SubmissionFile) {
    const { data, error } = await supabase.storage
      .from('projecthub-files').download(file.file_path)
    if (error || !data) { showToast('❌ 파일을 불러올 수 없습니다.'); return }
    const url = URL.createObjectURL(data)
    const a = document.createElement('a')
    a.href = url; a.download = file.file_name
    document.body.appendChild(a); a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    showToast(`📎 ${file.file_name} 다운로드 완료`)
  }

  async function downloadAll() {
    const list = filteredSubs.filter(s => s.submitted)
    if (list.length === 0) { showToast('다운로드할 제출 파일이 없습니다.'); return }
    showToast(`📥 ${list.length}개 보고서를 다운로드합니다.`)
    for (let i = 0; i < list.length; i++) {
      await new Promise(r => setTimeout(r, i * 350))
      const html = await buildReportHtml(list[i])
      const filename = `${list[i].student_id}_${list[i].student_name}_${list[i].subject_name}_${list[i].project_title}.html`
        .replace(/[\\/:*?"<>|]/g, '_')
      triggerDownload(html, filename)
    }
  }

  /* ── Forum CRUD ── */
  function openNewForum() {
    setCurrentForumId(null)
    setFTitle(''); setFDesc(''); setFSubjectId(''); setFActive(true); setFMediaItems([])
    setNewMediaUrl(''); setNewMediaCaption(''); setNewMediaType('video')
    setFLayoutMedia(62); setFCommentHeight(70)
    setFAnonymous(false); setFPassword(''); setFNotice('')
    setForumView('editor')
  }

  function openEditForum(f: Forum) {
    setCurrentForumId(f.id)
    setFTitle(f.title); setFDesc(f.description)
    setFSubjectId(f.subject_id || ''); setFActive(f.is_active)
    setFMediaItems(JSON.parse(JSON.stringify(f.media_items || [])))
    setFLayoutMedia(f.layout_media ?? 62)
    setFCommentHeight(f.comment_height ?? 70)
    setFAnonymous(f.anonymous ?? false)
    setFPassword(f.password ?? '')
    setFNotice(f.notice ?? '')
    setNewMediaUrl(''); setNewMediaCaption(''); setNewMediaType('video')
    setForumView('editor')
  }

  async function saveForum() {
    if (!fTitle.trim()) { showToast('포럼 제목을 입력하세요.'); return }
    const payload = {
      title: fTitle, description: fDesc,
      subject_id: fSubjectId || null,
      is_active: fActive, media_items: fMediaItems,
      layout_media: fLayoutMedia,
      layout_comment: 100 - fLayoutMedia,
      comment_height: fCommentHeight,
      anonymous: fAnonymous,
      password: fPassword,
      notice: fNotice,
    }
    if (currentForumId) {
      const { error } = await supabase.from('forums').update(payload).eq('id', currentForumId)
      if (!error) {
        setForums(prev => prev.map(f => f.id === currentForumId ? { ...f, ...payload } : f))
        showToast('✅ 포럼이 저장되었습니다.')
      }
    } else {
      const id = 'forum_' + Date.now()
      const { error } = await supabase.from('forums').insert({ id, ...payload })
      if (!error) {
        setForums(prev => [...prev, { id, ...payload }])
        setCurrentForumId(id)
        showToast('✅ 포럼이 생성되었습니다.')
      }
    }
  }

  async function deleteForum(id: string) {
    if (!confirm('포럼을 삭제할까요? 댓글도 모두 삭제됩니다.')) return
    await supabase.from('forums').delete().eq('id', id)
    setForums(prev => prev.filter(f => f.id !== id))
    if (currentForumId === id) { setCurrentForumId(null); setForumView('list') }
    showToast('🗑 포럼이 삭제되었습니다.')
  }

  function addMediaItem() {
    if (!newMediaUrl.trim()) return
    setFMediaItems(prev => [...prev, { type: newMediaType, url: newMediaUrl.trim(), caption: newMediaCaption.trim() }])
    setNewMediaUrl(''); setNewMediaCaption('')
  }
  function removeMediaItem(i: number) { setFMediaItems(prev => prev.filter((_, idx) => idx !== i)) }
  function moveMedia(i: number, dir: -1 | 1) {
    const arr = [...fMediaItems]; const j = i + dir
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]]; setFMediaItems(arr)
  }

  function copyForumLink(id: string) {
    const url = `${window.location.origin}/forum/${id}`
    navigator.clipboard.writeText(url)
    setCopiedLink(id)
    setTimeout(() => setCopiedLink(null), 2000)
    showToast('📋 링크가 복사되었습니다.')
  }

  function getSubjectProjects() { return projects.filter(p => p.subject_id === currentSubjectId) }

  if (!teacher) return <div className="loading-center">로딩 중...</div>

  const years = Array.from(new Set([new Date().getFullYear(), ...submissions.map(s => s.year)])).sort((a, b) => b - a)

  return (
    <div className={styles.dashPage}>
      {/* Topbar */}
      <div className={styles.topbar}>
        <div className={styles.dashLogo}>
          <div className={styles.logoIcon}>
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>
            </svg>
          </div>
          <span className={styles.dashSiteName}>ProjectHub</span>
        </div>
        <div className={styles.dashUser}>
          <span className={styles.dashUsername}>{teacher} 선생님</span>
          <button className={styles.btnLogout} onClick={() => { sessionStorage.removeItem('ph_teacher'); router.replace('/') }}>로그아웃</button>
        </div>
      </div>

      {/* Tabs */}
      <div className={styles.dashTabs}>
        <button className={`${styles.dashTab} ${dashTab === 'guidelines' ? styles.activeTab : ''}`} onClick={() => setDashTab('guidelines')}>
          📚 가이드라인 설정
        </button>
        <button className={`${styles.dashTab} ${dashTab === 'forums' ? styles.activeTab : ''}`} onClick={() => setDashTab('forums' as typeof dashTab)}>
          🎬 포럼 관리
        </button>
        <button className={`${styles.dashTab} ${dashTab === 'submissions' ? styles.activeTab : ''}`} onClick={() => setDashTab('submissions')}>
          📋 제출 파일 관리
        </button>
      </div>

      {/* ── Submissions Pane ── */}
      {dashTab === 'submissions' && (
        <div>
          <div className={styles.sectionTitle}>제출 파일 조회</div>
          <div className={styles.filterCard}>
            <div className={styles.filterRow}>
              <div className={styles.filterField}>
                <label>연도</label>
                <select value={fYear} onChange={e => setFYear(Number(e.target.value))}>
                  {years.map(y => <option key={y} value={y}>{y}년</option>)}
                </select>
              </div>
              <div className={styles.filterField}>
                <label>학년</label>
                <select value={fGrade} onChange={e => setFGrade(e.target.value)}>
                  <option value="">전체</option>
                  {[1,2,3].map(g => <option key={g} value={g}>{g}학년</option>)}
                </select>
              </div>
              <div className={styles.filterField}>
                <label>반</label>
                <select value={fClass} onChange={e => setFClass(e.target.value)}>
                  <option value="">전체</option>
                  {Array.from({length:10},(_,i)=>i+1).map(c => <option key={c} value={c}>{c}반</option>)}
                </select>
              </div>
              <div className={styles.filterField}>
                <label>과목</label>
                <select value={fSubject} onChange={e => { setFSubject(e.target.value); setFProject('') }}>
                  <option value="">전체 과목</option>
                  {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div className={styles.filterField}>
                <label>프로젝트</label>
                <select value={fProject} onChange={e => setFProject(e.target.value)}>
                  <option value="">전체</option>
                  {projects.filter(p => !fSubject || p.subject_id === fSubject).map(p =>
                    <option key={p.id} value={p.id}>{p.title}</option>)}
                </select>
              </div>
              <div className={styles.filterField}>
                <label>상태</label>
                <select value={fStatus} onChange={e => setFStatus(e.target.value)}>
                  <option value="">전체</option>
                  <option value="submitted">제출</option>
                  <option value="none">미제출</option>
                </select>
              </div>
              <button className={styles.btnSearch} onClick={searchSubmissions}>조회</button>
            </div>
          </div>

          {searched && (
            <div className={styles.resultCard}>
              <div className={styles.resultHeader}>
                <div className={styles.resultInfo}>총 <strong>{filteredSubs.length}</strong>건</div>
                {filteredSubs.some(s => s.submitted) && (
                  <button className={styles.btnDlAll} onClick={downloadAll}>
                    <span className={styles.btnDlAllIcon}>⬇</span> 워크시트 전체 다운로드
                  </button>
                )}
              </div>
              {filteredSubs.length === 0 ? (
                <div className={styles.emptyState}>
                  <div className={styles.emptyIcon}>📭</div>
                  <div className={styles.emptyText}>조건에 맞는 결과가 없습니다.</div>
                </div>
              ) : (
                <table className={styles.subTable}>
                  <thead>
                    <tr>
                      <th>학번</th><th>이름</th><th>과목</th><th>프로젝트</th>
                      <th>상태</th><th>제출일시</th><th>워크시트</th><th>첨부파일</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSubs.map(s => (
                      <tr key={s.id}>
                        <td><span className={styles.studentNum}>{s.student_id}</span></td>
                        <td><strong>{s.student_name}</strong></td>
                        <td>{s.subject_name}</td>
                        <td>{s.project_title}</td>
                        <td>
                          {s.submitted
                            ? <span className={styles.badgeSubmitted}>✓ 제출</span>
                            : <span className={styles.badgeNone}>미제출</span>}
                        </td>
                        <td><span className={styles.submitDate}>{s.submitted_at || '—'}</span></td>
                        <td>
                          {s.submitted
                            ? <button className={styles.btnDlWorksheet} onClick={() => downloadSingle(s)}>
                                📄 보고서
                              </button>
                            : <span className={styles.dlDisabled}>—</span>}
                        </td>
                        <td style={{ position: 'relative' }}>
                          {s.submitted
                            ? <div ref={fileDropdownId === s.id ? dropdownRef : null} style={{ position: 'relative', display: 'inline-block' }}>
                                <button
                                  className={`${styles.btnDlFile} ${fileDropdownId === s.id ? styles.btnDlFileActive : ''}`}
                                  onClick={() => toggleFileDropdown(s)}
                                >
                                  📎 첨부파일 {fileDropdownId === s.id ? '▲' : '▼'}
                                </button>
                                {fileDropdownId === s.id && (
                                  <div className={styles.fileDropdown}>
                                    <div className={styles.fileDropdownHeader}>
                                      {s.student_name}의 첨부파일
                                    </div>
                                    {fileDropdownLoading ? (
                                      <div className={styles.fileDropdownEmpty}>불러오는 중...</div>
                                    ) : fileDropdownData.length === 0 ? (
                                      <div className={styles.fileDropdownEmpty}>첨부파일 없음</div>
                                    ) : (
                                      fileDropdownData.map(f => (
                                        <div key={f.id} className={styles.fileDropdownItem} onClick={() => downloadStudentFile(f)}>
                                          <div className={styles.fileDropdownItemLeft}>
                                            <span className={styles.fileDropdownIcon}>📄</span>
                                            <div>
                                              <div className={styles.fileDropdownName}>{f.file_name}</div>
                                              <div className={styles.fileDropdownMeta}>{f.file_size} · {f.uploaded_at}</div>
                                            </div>
                                          </div>
                                          <span className={styles.fileDropdownDl}>⬇</span>
                                        </div>
                                      ))
                                    )}
                                  </div>
                                )}
                              </div>
                            : <span className={styles.dlDisabled}>—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Guidelines Pane ── */}
      {dashTab === 'guidelines' && (
        <div className={styles.glLayout}>
          {/* Sidebar */}
          <div className={styles.glSidebar}>
            <div className={styles.glSidebarTitle}>과목 목록</div>
            {subjects.length === 0 && (
              <div className={styles.glEmptySidebar}>아직 과목이 없습니다.<br/>아래에서 추가하세요.</div>
            )}
            <div className={styles.subjectList}>
              {subjects.map(s => (
                <div key={s.id}
                  className={`${styles.subjectItem} ${currentSubjectId === s.id && glView !== 'sidebar' ? styles.activeSubject : ''}`}
                  onClick={() => { setCurrentSubjectId(s.id); setCurrentProjectId(null); setGlView('projlist') }}>
                  <span className={styles.subjectItemName}>{s.name}</span>
                  <span className={styles.subjectCount}>{projects.filter(p => p.subject_id === s.id).length}</span>
                  <button className={styles.subjectDel} onClick={e => { e.stopPropagation(); deleteSubject(s.id) }}>✕</button>
                </div>
              ))}
            </div>
            <div className={styles.addSubjectRow}>
              <input className={styles.addSubjectInput} value={newSubjectName}
                onChange={e => setNewSubjectName(e.target.value)}
                placeholder="과목명 입력"
                onKeyDown={e => e.key === 'Enter' && addSubject()} />
              <button className={styles.btnAddSubject} onClick={addSubject}>+ 추가</button>
            </div>
          </div>

          {/* Right panel */}
          <div>
            {/* Project list */}
            {(glView === 'projlist' || glView === 'editor') && currentSubjectId && (
              <div className={styles.projListPanel} style={{ marginBottom: glView === 'editor' ? '1rem' : 0 }}>
                <div className={styles.projListHeader}>
                  <span className={styles.projListSubjectName}>
                    {subjects.find(s => s.id === currentSubjectId)?.name}
                    <span className={styles.projListBadge}>과목</span>
                  </span>
                  <button className={styles.btnBackSubject} onClick={() => { setGlView('sidebar'); setCurrentSubjectId(null) }}>← 목록</button>
                </div>
                <div className={styles.projCards}>
                  {getSubjectProjects().length === 0 && (
                    <div className={styles.projEmpty}>아직 프로젝트가 없습니다.<br/>아래에서 추가하세요.</div>
                  )}
                  {getSubjectProjects().map((p, i) => (
                    <div key={p.id}
                      className={`${styles.projCardItem} ${currentProjectId === p.id && glView === 'editor' ? styles.activeProjCard : ''}`}
                      onClick={() => openEditor(p.id)}>
                      <div className={styles.projCardIcon}>{SUBJECT_ICONS[i % SUBJECT_ICONS.length]}</div>
                      <div className={styles.projCardInfo}>
                        <div className={styles.projCardTitle}>{p.title}</div>
                        <div className={styles.projCardMeta}>{p.stages.length}단계</div>
                      </div>
                      <button className={styles.projDelBtn} onClick={e => { e.stopPropagation(); deleteProject(p.id) }}>✕</button>
                    </div>
                  ))}
                </div>
                <div className={styles.addProjRow}>
                  <input className={styles.addProjInput} value={newProjName}
                    onChange={e => setNewProjName(e.target.value)}
                    placeholder="프로젝트 제목 입력"
                    onKeyDown={e => e.key === 'Enter' && addProject()} />
                  <button className={styles.btnAddProj} onClick={addProject}>+ 추가</button>
                </div>
              </div>
            )}

            {/* Editor */}
            {glView === 'editor' && currentProjectId && (
              <div className={styles.glEditor}>
                <div className={styles.glEditorHeader}>
                  <div className={styles.glEditorTitleGroup}>
                    <div className={styles.glSubjectLabel}>{subjects.find(s => s.id === currentSubjectId)?.name}</div>
                    <input className={styles.glTitleInput} value={editorTitle}
                      onChange={e => setEditorTitle(e.target.value)} placeholder="프로젝트 제목" />
                    <textarea className={styles.glDescInput} value={editorDesc}
                      onChange={e => setEditorDesc(e.target.value)} placeholder="프로젝트 설명 (선택)" rows={2} />
                  </div>
                  <div className={styles.glHeaderActions}>
                    <button className={styles.btnGlPreview} onClick={() => setPreviewOpen(true)}>👀 미리보기</button>
                    <button className={styles.btnGlSave} onClick={saveGuideline}>💾 저장</button>
                  </div>
                </div>

                <div className={styles.stagesSectionHeader}>
                  <div className={styles.stagesSectionLabel}>
                    진행 단계 <span>{editorStages.length}단계</span>
                  </div>
                  <button className={styles.btnAddStage} onClick={addStage}>+ 단계 추가</button>
                </div>

                <div className={styles.stagesList}>
                  {editorStages.length === 0 && (
                    <div className={styles.stagesEmpty}>아직 단계가 없습니다. <strong>+ 단계 추가</strong>를 눌러 시작하세요.</div>
                  )}
                  {editorStages.map((st, si) => (
                    <div key={si} className={styles.stageCard}>
                      <div className={styles.stageCardHead}>
                        <div className={styles.stageBadge}>{si + 1}</div>
                        <input className={styles.stageTitleInput} value={st.title}
                          onChange={e => updateStageTitle(si, e.target.value)}
                          placeholder={`${si + 1}단계 제목`} />
                        <div className={styles.stageCardActions}>
                          <button className={styles.stageMoveBtn} disabled={si === 0} onClick={() => moveStage(si, -1)}>↑</button>
                          <button className={styles.stageMoveBtn} disabled={si === editorStages.length - 1} onClick={() => moveStage(si, 1)}>↓</button>
                          <button className={styles.stageDelBtn} onClick={() => deleteStage(si)}>✕</button>
                        </div>
                      </div>
                      <div className={styles.stageCardBody}>
                        <div className={styles.itemsList}>
                          {st.items.map((item, ii) => (
                            <div key={ii} className={styles.itemRow}>
                              <span className={`${styles.itemTypeBadge} ${item.type === 'q' ? styles.itemTypeQ : styles.itemTypeD}`}>
                                {item.type === 'q' ? '질문' : '설명'}
                              </span>
                              <textarea className={styles.itemContentInput} value={item.content}
                                onChange={e => updateItem(si, ii, e.target.value)}
                                placeholder={item.type === 'q' ? '학생에게 물어볼 질문을 입력하세요' : '학생에게 전달할 설명을 입력하세요'}
                                rows={2} />
                              <button className={styles.itemDelBtn} onClick={() => deleteItem(si, ii)}>✕</button>
                            </div>
                          ))}
                        </div>
                        <div className={styles.addItemRow}>
                          <button className={styles.btnAddItem} onClick={() => addItem(si, 'q')}>+ 질문</button>
                          <button className={`${styles.btnAddItem} ${styles.btnAddDesc}`} onClick={() => addItem(si, 'd')}>+ 설명</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Placeholder when nothing selected */}
            {glView === 'sidebar' && (
              <div className={styles.glEditorPlaceholder}>
                <div className={styles.phIcon}>📋</div>
                <p>왼쪽에서 과목을 선택하거나<br/>새 과목을 추가하세요.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {previewOpen && (
        <div className="modal-overlay open" onClick={e => { if (e.target === e.currentTarget) setPreviewOpen(false) }}>
          <div className="modal-box">
            <div className="modal-header">
              <span className="modal-title">👀 학생에게 보이는 가이드라인 미리보기</span>
              <button className="modal-close" onClick={() => setPreviewOpen(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className={styles.previewSubjectBadge}>{subjects.find(s => s.id === currentSubjectId)?.name}</div>
              <div className={styles.previewTitle}>{editorTitle || <span style={{color:'var(--text-hint)'}}>제목 없음</span>}</div>
              {editorDesc && <div className={styles.previewDesc}>{editorDesc}</div>}
              {editorStages.map((st, i) => (
                <div key={i} className={styles.previewStage}>
                  <div className={styles.previewStageHead}>
                    <div className={styles.previewStageNum}>{i + 1}</div>
                    <div className={styles.previewStageName}>{st.title || `${i + 1}단계`}</div>
                  </div>
                  {st.items.filter(it => it.content).map((it, ii) => (
                    <div key={ii} className={styles.previewItem}>
                      <span className={`${styles.previewItemBadge} ${it.type === 'q' ? styles.itemTypeQ : styles.itemTypeD}`}>
                        {it.type === 'q' ? '질문' : '설명'}
                      </span>
                      <span className={styles.previewItemText}>{it.content}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Forums Pane ── */}
      {dashTab === 'forums' && (
        <div>
          {forumView === 'list' && (
            <div>
              <div className={styles.forumListHeader}>
                <div className={styles.sectionTitle}>🎬 포럼 목록</div>
                <button className={styles.btnNewForum} onClick={openNewForum}>+ 새 포럼</button>
              </div>
              {forums.length === 0 ? (
                <div className={styles.forumEmpty}>
                  <div>🎬</div>
                  <p>아직 포럼이 없습니다.<br/><strong>+ 새 포럼</strong>을 눌러 만들어보세요.</p>
                </div>
              ) : (
                <div className={styles.forumCards}>
                  {forums.map(f => (
                    <div key={f.id} className={styles.forumCard}>
                      <div className={styles.forumCardLeft}>
                        <div className={styles.forumCardTitle}>{f.title}</div>
                        <div className={styles.forumCardMeta}>
                          {f.subject_id && <span>{subjects.find(s => s.id === f.subject_id)?.name}</span>}
                          <span>{f.media_items?.length || 0}개 미디어</span>
                          <span className={f.is_active ? styles.forumActiveBadge : styles.forumInactiveBadge}>
                            {f.is_active ? '활성' : '비활성'}
                          </span>
                        </div>
                      </div>
                      <div className={styles.forumCardActions}>
                        <button className={styles.btnOpenForum} onClick={() => router.push(`/forum/${f.id}`)}>
                          ▶ 포럼 열기
                        </button>
                        <button className={styles.btnCopyLink} onClick={() => copyForumLink(f.id)}>
                          {copiedLink === f.id ? '✅ 복사됨' : '🔗 링크 복사'}
                        </button>
                        <button className={styles.btnEditForum} onClick={() => openEditForum(f)}>편집</button>
                        <button className={styles.btnDelForum} onClick={() => deleteForum(f.id)}>삭제</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {forumView === 'editor' && (
            <div className={styles.forumEditor}>
              <div className={styles.forumEditorHeader}>
                <button className={styles.backLink} onClick={() => setForumView('list')}>← 목록으로</button>
                <div className={styles.forumEditorTitle}>{currentForumId ? '포럼 편집' : '새 포럼 만들기'}</div>
                <div className={styles.forumEditorActions}>
                  {currentForumId && (
                    <button className={styles.btnCopyLink} onClick={() => copyForumLink(currentForumId)}>
                      {copiedLink === currentForumId ? '✅ 복사됨' : '🔗 학생 링크 복사'}
                    </button>
                  )}
                  <button className={styles.btnGlSave} onClick={saveForum}>💾 저장</button>
                </div>
              </div>

              <div className={styles.forumEditorBody}>
                {/* 기본 정보 */}
                <div className={styles.forumSection}>
                  <div className={styles.forumSectionLabel}>기본 정보</div>
                  <div className={styles.forumField}>
                    <label>포럼 제목</label>
                    <input value={fTitle} onChange={e => setFTitle(e.target.value)} placeholder="포럼 제목 입력" className={styles.forumInput} />
                  </div>
                  <div className={styles.forumField}>
                    <label>설명 (선택)</label>
                    <textarea value={fDesc} onChange={e => setFDesc(e.target.value)} placeholder="포럼에 대한 설명, 학습 목표 등" rows={3} className={styles.forumTextarea} />
                  </div>
                  <div className={styles.forumFieldRow}>
                    <div className={styles.forumField}>
                      <label>상태</label>
                      <select value={fActive ? 'active' : 'inactive'} onChange={e => setFActive(e.target.value === 'active')} className={styles.forumSelect}>
                        <option value="active">활성 (학생 접근 가능)</option>
                        <option value="inactive">비활성 (숨김)</option>
                      </select>
                    </div>
                    <div className={styles.forumField}>
                      <label>댓글 표시 방식</label>
                      <select value={fAnonymous ? 'anon' : 'named'} onChange={e => setFAnonymous(e.target.value === 'anon')} className={styles.forumSelect}>
                        <option value="named">실명 (학번 + 이름)</option>
                        <option value="anon">익명</option>
                      </select>
                    </div>
                  </div>

                  <div className={styles.forumFieldRow}>
                    <div className={styles.forumField}>
                      <label>입장 비밀번호 <span className={styles.fieldOptional}>(비워두면 없음)</span></label>
                      <input value={fPassword} onChange={e => setFPassword(e.target.value)}
                        placeholder="숫자나 문자 조합"
                        className={styles.forumInput} />
                    </div>
                    <div className={styles.forumField}>
                      <label>공지 메시지 <span className={styles.fieldOptional}>(비워두면 없음)</span></label>
                      <input value={fNotice} onChange={e => setFNotice(e.target.value)}
                        placeholder="포럼 상단에 고정 표시될 메시지"
                        className={styles.forumInput} />
                    </div>
                  </div>
                </div>

                {/* 레이아웃 설정 */}
                <div className={styles.forumSection}>
                  <div className={styles.forumSectionLabel}>레이아웃 설정</div>

                  {/* 미디어/댓글 비율 */}
                  <div className={styles.forumField}>
                    <label>미디어 영역 너비 <strong style={{color:'var(--accent)'}}>{fLayoutMedia}%</strong> / 댓글 영역 <strong style={{color:'var(--teacher)'}}>{100 - fLayoutMedia}%</strong></label>
                    <div className={styles.sliderWrap}>
                      <span className={styles.sliderLabel}>미디어 넓게</span>
                      <input type="range" min={40} max={80} step={2} value={fLayoutMedia}
                        onChange={e => setFLayoutMedia(Number(e.target.value))}
                        className={styles.slider} />
                      <span className={styles.sliderLabel}>댓글 넓게</span>
                    </div>
                    <div className={styles.layoutPreview}>
                      <div className={styles.layoutPreviewMedia} style={{flex: fLayoutMedia}}>
                        🎬 미디어 {fLayoutMedia}%
                      </div>
                      <div className={styles.layoutPreviewComment} style={{flex: 100 - fLayoutMedia}}>
                        💬 댓글 {100 - fLayoutMedia}%
                      </div>
                    </div>
                  </div>

                  {/* 댓글창 높이 */}
                  <div className={styles.forumField}>
                    <label>댓글 목록 높이 <strong style={{color:'var(--teacher)'}}>{fCommentHeight}vh</strong></label>
                    <div className={styles.sliderWrap}>
                      <span className={styles.sliderLabel}>낮게</span>
                      <input type="range" min={30} max={85} step={5} value={fCommentHeight}
                        onChange={e => setFCommentHeight(Number(e.target.value))}
                        className={styles.slider} />
                      <span className={styles.sliderLabel}>높게</span>
                    </div>
                  </div>
                </div>

                {/* 미디어 목록 */}
                <div className={styles.forumSection}>
                  <div className={styles.forumSectionLabel}>미디어 목록 <span>{fMediaItems.length}개</span></div>
                  {fMediaItems.length === 0 && (
                    <div className={styles.mediaEmptyEditor}>아래에서 미디어를 추가하세요. (YouTube, 이미지 URL, 외부 링크 등)</div>
                  )}
                  <div className={styles.mediaEditorList}>
                    {fMediaItems.map((m, i) => (
                      <div key={i} className={styles.mediaEditorItem}>
                        <div className={styles.mediaEditorNum}>{i + 1}</div>
                        <div className={styles.mediaEditorInfo}>
                          <span className={styles.mediaTypeBadge}>{m.type}</span>
                          <span className={styles.mediaEditorUrl}>{m.url.length > 50 ? m.url.slice(0, 50) + '…' : m.url}</span>
                          {m.caption && <span className={styles.mediaEditorCaption}>"{m.caption}"</span>}
                        </div>
                        <div className={styles.mediaEditorBtns}>
                          <button className={styles.stageMoveBtn} disabled={i === 0} onClick={() => moveMedia(i, -1)}>↑</button>
                          <button className={styles.stageMoveBtn} disabled={i === fMediaItems.length - 1} onClick={() => moveMedia(i, 1)}>↓</button>
                          <button className={styles.stageDelBtn} onClick={() => removeMediaItem(i)}>✕</button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* 새 미디어 추가 */}
                  <div className={styles.addMediaBox}>
                    <div className={styles.addMediaRow}>
                      <select value={newMediaType} onChange={e => setNewMediaType(e.target.value as MediaItem['type'])} className={styles.addMediaType}>
                        <option value="video">🎬 영상</option>
                        <option value="image">🖼 이미지</option>
                        <option value="embed">🔗 임베드</option>
                      </select>
                      <input value={newMediaUrl} onChange={e => setNewMediaUrl(e.target.value)}
                        placeholder="URL 입력 (YouTube, 이미지 URL 등)"
                        className={styles.addMediaInput}
                        onKeyDown={e => e.key === 'Enter' && addMediaItem()} />
                    </div>
                    <div className={styles.addMediaRow}>
                      <input value={newMediaCaption} onChange={e => setNewMediaCaption(e.target.value)}
                        placeholder="캡션 (선택)"
                        className={styles.addMediaInput}
                        onKeyDown={e => e.key === 'Enter' && addMediaItem()} />
                      <button className={styles.btnAddMedia} onClick={addMediaItem}>+ 추가</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Toast */}
      <div className={`toast ${toastVisible ? 'show' : ''}`}>{toast}</div>
    </div>
  )
}
