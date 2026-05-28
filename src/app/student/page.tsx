'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import styles from './student.module.css'

interface Subject { id: string; name: string }
interface StageItem { type: 'q' | 'd'; content: string }
interface Stage { title: string; items: StageItem[] }
interface Project { id: string; subject_id: string; title: string; description: string; stages: Stage[] }
interface Submission { project_id: string; answers: Record<string, string>; file_name: string | null; submitted_at: string }

const SUBJECT_ICONS = ['📖','🔬','🎨','🌍','💻','🎵','⚽','📐','🧬','📝']

type View = 'subjects' | 'projects' | 'worksheet'

export default function StudentDashboard() {
  const router = useRouter()
  const supabase = createClient()
  const [student, setStudent] = useState<{id: string; name: string} | null>(null)

  const [subjects, setSubjects] = useState<Subject[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [submissions, setSubmissions] = useState<Submission[]>([])

  const [view, setView] = useState<View>('subjects')
  const [currentSubjectId, setCurrentSubjectId] = useState<string | null>(null)
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null)

  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [submitted, setSubmitted] = useState(false)
  const [submitInfo, setSubmitInfo] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)

  const [toast, setToast] = useState('')
  const [toastVisible, setToastVisible] = useState(false)

  /* ── Auth guard ── */
  useEffect(() => {
    const s = sessionStorage.getItem('ph_student')
    if (!s) { router.replace('/'); return }
    setStudent(JSON.parse(s))
  }, [router])

  /* ── Load data ── */
  const loadData = useCallback(async (stuId: string) => {
    const [{ data: subs }, { data: projs }, { data: sbms }] = await Promise.all([
      supabase.from('subjects').select('*').order('created_at'),
      supabase.from('projects').select('*').order('created_at'),
      supabase.from('submissions').select('project_id,answers,file_name,submitted_at').eq('student_id', stuId),
    ])
    if (subs) setSubjects(subs)
    if (projs) setProjects(projs)
    if (sbms) setSubmissions(sbms)
  }, [supabase])

  useEffect(() => { if (student) loadData(student.id) }, [student, loadData])

  function showToast(msg: string) {
    setToast(msg); setToastVisible(true)
    setTimeout(() => setToastVisible(false), 2200)
  }

  /* ── Navigation ── */
  function selectSubject(id: string) {
    setCurrentSubjectId(id)
    setCurrentProjectId(null)
    setView('projects')
  }

  async function selectProject(projId: string) {
    if (!student) return
    setCurrentProjectId(projId)

    // Load draft answers
    const { data: draft } = await supabase.from('answer_drafts')
      .select('answers').eq('student_id', student.id).eq('project_id', projId).single()
    setAnswers(draft?.answers || {})

    // Check submission
    const sub = submissions.find(s => s.project_id === projId)
    if (sub) {
      setSubmitted(true)
      setAnswers(sub.answers)
      setSubmitInfo(`제출 시각: ${sub.submitted_at}${sub.file_name ? ' · 파일: ' + sub.file_name : ''}`)
    } else {
      setSubmitted(false)
      setSubmitInfo('')
    }
    setSelectedFile(null)
    setView('worksheet')
  }

  /* ── Auto-save draft ── */
  async function saveDraft(key: string, value: string) {
    if (!student || !currentProjectId || submitted) return
    const newAnswers = { ...answers, [key]: value }
    setAnswers(newAnswers)
    await supabase.from('answer_drafts').upsert({
      student_id: student.id,
      subject_id: currentSubjectId,
      project_id: currentProjectId,
      answers: newAnswers,
    }, { onConflict: 'student_id,project_id' })
  }

  /* ── Submit ── */
  async function submitWorksheet() {
    if (!student || !currentProjectId || !currentSubjectId) return
    const proj = projects.find(p => p.id === currentProjectId)
    if (!proj) return
    const subj = subjects.find(s => s.id === currentSubjectId)
    const now = new Date().toLocaleString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    const sid = student.id
    const grade = parseInt(sid[0]) || 1
    const cls = parseInt(sid[1]) || 1
    const no = parseInt(sid.slice(2)) || 1

    const { error } = await supabase.from('submissions').upsert({
      year: new Date().getFullYear(), grade, cls, no,
      student_id: sid, student_name: student.name,
      subject_id: currentSubjectId, subject_name: subj?.name || '',
      project_id: currentProjectId, project_title: proj.title,
      answers, submitted: true,
      file_name: selectedFile ? selectedFile.name : null,
      file_size: selectedFile ? (selectedFile.size / 1024 / 1024).toFixed(1) + 'MB' : null,
      submitted_at: now,
    }, { onConflict: 'student_id,project_id' })

    if (error) { showToast('❌ 제출 중 오류가 발생했습니다.'); return }

    setSubmitted(true)
    setSubmitInfo(`제출 시각: ${now}${selectedFile ? ' · 파일: ' + selectedFile.name : ''}`)
    setSubmissions(prev => {
      const filtered = prev.filter(s => s.project_id !== currentProjectId)
      return [...filtered, { project_id: currentProjectId, answers, file_name: selectedFile?.name || null, submitted_at: now }]
    })
    showToast('✅ 제출이 완료되었습니다!')
  }

  function getSubjectProjects() { return projects.filter(p => p.subject_id === currentSubjectId) }
  const visibleSubjects = subjects.filter(s => projects.some(p => p.subject_id === s.id))
  const currentProject = projects.find(p => p.id === currentProjectId)
  const currentSubject = subjects.find(s => s.id === currentSubjectId)

  // Progress
  const allItems = (currentProject?.stages || []).flatMap(st => st.items)
  const answered = allItems.filter((_, i) => {
    const stageIdx = (currentProject?.stages || []).findIndex(st => st.items.includes(_))
    return answers[`${stageIdx}_${st_item_idx(currentProject!, stageIdx, _)}`]?.trim()
  }).length

  function st_item_idx(proj: Project, si: number, item: StageItem) {
    return proj.stages[si]?.items.indexOf(item) ?? 0
  }

  const totalItems = allItems.length
  const pct = totalItems > 0 ? Math.round(answered / totalItems * 100) : 0

  if (!student) return <div className="loading-center">로딩 중...</div>

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
        <div className={styles.stuInfo}>
          <span className={styles.stuBadge}>STUDENT</span>
          <span className={styles.stuName}><strong>{student.name}</strong> ({student.id})</span>
          <button className={styles.btnLogout} onClick={() => { sessionStorage.removeItem('ph_student'); router.replace('/') }}>로그아웃</button>
        </div>
      </div>

      {/* ── View: Subjects ── */}
      {view === 'subjects' && (
        <div>
          <p className={styles.sectionTitle}>📚 과목 선택</p>
          <p className={styles.sectionSub}>참여할 과목을 선택하세요.</p>
          {visibleSubjects.length === 0 ? (
            <div className={styles.emptyState}>
              <div>📭</div>
              <p>아직 개설된 과목이 없습니다.<br/>교사가 과목을 추가하면 여기에 표시됩니다.</p>
            </div>
          ) : (
            <div className={styles.subjectGrid}>
              {visibleSubjects.map((s, i) => (
                <div key={s.id} className={styles.subjectCard} onClick={() => selectSubject(s.id)}>
                  <div className={styles.subjectCardIcon}>{SUBJECT_ICONS[i % SUBJECT_ICONS.length]}</div>
                  <div className={styles.subjectCardName}>{s.name}</div>
                  <div className={styles.subjectCardMeta}>프로젝트 {projects.filter(p => p.subject_id === s.id).length}개</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── View: Projects ── */}
      {view === 'projects' && (
        <div>
          <button className={styles.backBtn} onClick={() => setView('subjects')}>← 과목 목록으로</button>
          <p className={styles.breadcrumb}>📚 {currentSubject?.name}</p>
          <p className={styles.sectionTitle}>{currentSubject?.name} 프로젝트</p>
          <p className={styles.sectionSub}>참여할 프로젝트를 선택하세요.</p>
          {getSubjectProjects().length === 0 ? (
            <div className={styles.emptyState}><p>이 과목에 아직 프로젝트가 없습니다.</p></div>
          ) : (
            <div className={styles.projGrid}>
              {getSubjectProjects().map((p, i) => {
                const sub = submissions.find(s => s.project_id === p.id)
                return (
                  <div key={p.id} className={`${styles.projCard} ${sub ? styles.projSubmitted : ''}`} onClick={() => selectProject(p.id)}>
                    <div className={styles.projCardNum}>{i + 1}</div>
                    <div className={styles.projCardName}>{p.title}</div>
                    {p.description && <div className={styles.projCardDesc}>{p.description}</div>}
                    <div className={styles.projCardFooter}>
                      <span className={styles.projCardStages}>{p.stages.length}단계</span>
                      {sub && <span className={styles.projSubmittedBadge}>✅ 제출완료</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── View: Worksheet ── */}
      {view === 'worksheet' && currentProject && (
        <div>
          <button className={styles.backBtn} onClick={() => setView('projects')}>← 프로젝트 목록으로</button>
          <div className={styles.worksheetHeader}>
            <div className={styles.wsSubjectBadge}>{currentSubject?.name}</div>
            <div className={styles.wsProjTitle}>{currentProject.title}</div>
            {currentProject.description && <div className={styles.wsProjDesc}>{currentProject.description}</div>}
            <div className={styles.wsMeta}>
              <div className={styles.wsMetaItem}>📋 {currentProject.stages.length}단계</div>
              {submitted && <div className={styles.wsMetaItem}>✅ 제출완료</div>}
            </div>
            {/* Progress */}
            <div className={styles.wsProgress}>
              <span>{Object.values(answers).filter(v => v.trim()).length}/{totalItems}개 작성</span>
              <div className={styles.wsProgressBar}>
                <div className={styles.wsProgressFill} style={{ width: pct + '%' }} />
              </div>
            </div>
          </div>

          {/* Submitted banner */}
          {submitted && (
            <div className={styles.submittedBanner}>
              ✅ 이미 제출된 워크시트입니다.
              <span className={styles.submittedInfo}>{submitInfo}</span>
            </div>
          )}

          {/* Stages */}
          <div className={styles.stagesList}>
            {currentProject.stages.map((st, si) => (
              <div key={si} className={styles.wsStage}>
                <div className={styles.wsStageHead}>
                  <div className={styles.wsStageNum}>{si + 1}</div>
                  <div className={styles.wsStageName}>{st.title || `${si + 1}단계`}</div>
                </div>
                <div className={styles.wsStageBody}>
                  {st.items.map((item, ii) => {
                    const key = `${si}_${ii}`
                    const isQ = item.type === 'q'
                    return (
                      <div key={ii} className={styles.wsItem}>
                        <div className={styles.wsItemPrompt}>
                          <span className={`${styles.wsItemBadge} ${isQ ? styles.wsBadgeQ : styles.wsBadgeD}`}>
                            {isQ ? '질문' : '설명'}
                          </span>
                          <span className={styles.wsItemText}>{item.content}</span>
                        </div>
                        <textarea
                          className={`${styles.wsAnswer} ${!isQ ? styles.descAnswer : ''}`}
                          value={answers[key] || ''}
                          readOnly={submitted}
                          placeholder={isQ ? '여기에 답변을 작성하세요...' : '내용을 기록하세요...'}
                          onChange={e => saveDraft(key, e.target.value)}
                        />
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Submit form */}
          {!submitted && (
            <div className={styles.submitForm}>
              <div className={styles.submitFormTitle}>📤 워크시트 제출</div>
              <div className={styles.fileUploadRow}>
                <label className={styles.fileLabel}>
                  📎 파일 첨부 (선택)
                  <input type="file" style={{ display: 'none' }} onChange={e => setSelectedFile(e.target.files?.[0] || null)} />
                </label>
                {selectedFile && <span className={styles.fileName}>{selectedFile.name}</span>}
              </div>
              <button className={styles.btnSubmit} onClick={submitWorksheet}>제출하기</button>
            </div>
          )}
        </div>
      )}

      {/* Toast */}
      <div className={`toast ${toastVisible ? 'show' : ''}`}>{toast}</div>
    </div>
  )
}
