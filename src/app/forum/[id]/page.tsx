'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import styles from './forum.module.css'

interface MediaItem { type: 'video' | 'image' | 'embed' | 'pdf' | 'slides'; url: string; caption: string }
interface Forum {
  id: string; title: string; description: string; media_items: MediaItem[]
  layout_media: number; layout_comment: number; comment_height: number
  anonymous: boolean; password: string; notice: string
  comments_enabled: boolean; replies_enabled: boolean
}
interface Comment {
  id: number; student_id: string; student_name: string; content: string; created_at: string
  is_pinned?: boolean; parent_id?: number | null
}
interface Poll {
  id: string; forum_id: string; question: string; poll_type: 'choice' | 'text'
  options: string[]; time_limit: number | null; is_active: boolean; show_result: boolean
}
interface PollResponse { id: number; poll_id: string; student_id: string; student_name: string; answer: string }

function toYouTubeEmbed(url: string) {
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/)
  return m ? `https://www.youtube.com/embed/${m[1]}` : null
}
function isVideoFile(url: string) { return /\.(mp4|webm|ogg|mov)(\?|$)/i.test(url) }
function isImageFile(url: string) { return /\.(jpg|jpeg|png|gif|webp|svg)(\?|$)/i.test(url) }

function DocViewer({ item }: { item: MediaItem }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [urlStatus, setUrlStatus] = useState<'checking' | 'ok' | 'error'>('checking')
  const [urlError, setUrlError] = useState('')

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [])

  // PDF/슬라이드 URL이 실제로 접근 가능한지 HEAD 요청으로 확인
  useEffect(() => {
    if (item.type !== 'pdf' && item.type !== 'slides') return
    // Google Slides는 별도 확인 불필요
    if (item.type === 'slides' && item.url.includes('docs.google.com')) {
      setUrlStatus('ok'); return
    }
    setUrlStatus('checking')
    fetch(item.url, { method: 'HEAD' })
      .then(res => {
        if (res.ok) {
          setUrlStatus('ok')
        } else {
          res.text().catch(() => '')
          setUrlError(`파일을 불러올 수 없습니다 (${res.status}). Supabase Storage 버킷이 Public으로 설정되어 있는지 확인하세요.`)
          setUrlStatus('error')
        }
      })
      .catch(() => {
        // CORS로 HEAD가 막혀도 일단 시도 (브라우저가 직접 렌더링)
        setUrlStatus('ok')
      })
  }, [item.url, item.type])

  function toggleFullscreen() {
    if (!containerRef.current) return
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen()
    } else {
      document.exitFullscreen()
    }
  }

  // PDF
  if (item.type === 'pdf') {
    return (
      <div className={styles.docViewerWrap} ref={containerRef}>
        <div className={styles.docViewerToolbar}>
          <span className={styles.docViewerBadge}>📄 PDF</span>
          {item.caption && <span className={styles.docViewerCaption}>{item.caption}</span>}
          <a className={styles.docViewerFsBtn} href={item.url} target="_blank" rel="noreferrer">↗ 새 탭</a>
          <button className={styles.docViewerFsBtn} onClick={toggleFullscreen}>
            {isFullscreen ? '⛶ 종료' : '⛶ 전체화면'}
          </button>
        </div>
        {urlStatus === 'checking' && (
          <div className={styles.docViewerLoading}>⏳ 파일 로딩 중...</div>
        )}
        {urlStatus === 'error' && (
          <div className={styles.docViewerError}>
            <div className={styles.docViewerErrorIcon}>⚠️</div>
            <div className={styles.docViewerErrorMsg}>{urlError}</div>
            <div className={styles.docViewerErrorHint}>
              Supabase Dashboard → Storage → <strong>projecthub-files</strong> 버킷 선택 →<br />
              우측 상단 <strong>Make Public</strong> 클릭 후 다시 시도하세요.
            </div>
            <a className={styles.docViewerErrorLink} href={item.url} target="_blank" rel="noreferrer">↗ URL 직접 열기</a>
          </div>
        )}
        {urlStatus === 'ok' && (
          <iframe
            className={styles.docViewerFrame}
            src={`${item.url}#toolbar=1&navpanes=1&scrollbar=1&view=FitH`}
            title={item.caption || 'PDF'}
          />
        )}
      </div>
    )
  }

  // Slides: Google Slides embed 또는 PPT/PPTX → Office Online Viewer
  if (item.type === 'slides') {
    let embedUrl = item.url
    if (item.url.includes('docs.google.com/presentation')) {
      embedUrl = item.url
        .replace(/\/pub(\?|$)/, '/embed$1')
        .replace(/\/edit(\?|$)/, '/embed$1')
        .replace(/\/preview(\?|$)/, '/embed$1')
      if (!embedUrl.includes('/embed')) {
        embedUrl = embedUrl.replace(/\/(presentation\/d\/[^/]+).*/, '/$1/embed')
      }
    } else {
      // PPT/PPTX Supabase URL → Microsoft Office Online Viewer
      embedUrl = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(item.url)}`
    }
    return (
      <div className={styles.docViewerWrap} ref={containerRef}>
        <div className={styles.docViewerToolbar}>
          <span className={styles.docViewerBadge} style={{ background: '#ea580c' }}>📊 슬라이드</span>
          {item.caption && <span className={styles.docViewerCaption}>{item.caption}</span>}
          <a className={styles.docViewerFsBtn} href={item.url} target="_blank" rel="noreferrer">↗ 새 탭</a>
          <button className={styles.docViewerFsBtn} onClick={toggleFullscreen}>
            {isFullscreen ? '⛶ 종료' : '⛶ 전체화면'}
          </button>
        </div>
        {urlStatus === 'checking' && (
          <div className={styles.docViewerLoading}>⏳ 파일 로딩 중...</div>
        )}
        {urlStatus === 'error' && (
          <div className={styles.docViewerError}>
            <div className={styles.docViewerErrorIcon}>⚠️</div>
            <div className={styles.docViewerErrorMsg}>{urlError}</div>
            <div className={styles.docViewerErrorHint}>
              Supabase Dashboard → Storage → <strong>projecthub-files</strong> 버킷 선택 →<br />
              우측 상단 <strong>Make Public</strong> 클릭 후 다시 시도하세요.
            </div>
            <a className={styles.docViewerErrorLink} href={item.url} target="_blank" rel="noreferrer">↗ URL 직접 열기</a>
          </div>
        )}
        {urlStatus === 'ok' && (
          <iframe
            className={styles.docViewerFrame}
            src={embedUrl}
            allowFullScreen
            title={item.caption || '슬라이드'}
          />
        )}
      </div>
    )
  }

  // 기존 미디어 타입
  const ytEmbed = item.type === 'video' ? toYouTubeEmbed(item.url) : null
  return (
    <div className={styles.mediaBlock}>
      {ytEmbed ? (
        <iframe className={styles.mediaIframe} src={ytEmbed} allowFullScreen
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" />
      ) : item.type === 'video' || isVideoFile(item.url) ? (
        <video className={styles.mediaVideo} controls src={item.url} />
      ) : item.type === 'image' || isImageFile(item.url) ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className={styles.mediaImage} src={item.url} alt={item.caption || ''} />
      ) : (
        <iframe className={styles.mediaIframe} src={item.url} allowFullScreen />
      )}
      {item.caption && <div className={styles.mediaCaption}>{item.caption}</div>}
    </div>
  )
}

/* ── 핀된 댓글 패널 (미디어 패널 하단에 표시) ── */
function PinnedCommentsPanel({
  pinnedComments,
  anonymous,
}: {
  pinnedComments: Comment[]
  anonymous: boolean
}) {
  if (pinnedComments.length === 0) return null

  const count = pinnedComments.length

  // 개수에 따라 그리드 레이아웃 자동 결정
  let gridCols = 1
  let maxH = '120px'
  if (count === 1) { gridCols = 1; maxH = '110px' }
  else if (count === 2) { gridCols = 2; maxH = '110px' }
  else if (count === 3) { gridCols = 3; maxH = '110px' }
  else if (count === 4) { gridCols = 2; maxH = '220px' }
  else if (count <= 6) { gridCols = 3; maxH = '220px' }
  else if (count <= 9) { gridCols = 3; maxH = '330px' }
  else { gridCols = 4; maxH = '330px' }

  return (
    <div className={styles.pinnedPanel}>
      <div className={styles.pinnedPanelHeader}>
        <span className={styles.pinnedPanelIcon}>📌</span>
        <span className={styles.pinnedPanelTitle}>교사 선택 댓글</span>
        <span className={styles.pinnedPanelCount}>{count}개</span>
      </div>
      <div
        className={styles.pinnedGrid}
        style={{
          gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
          maxHeight: maxH,
        }}
      >
        {pinnedComments.map((c, idx) => (
          <div key={c.id} className={styles.pinnedCard} style={{ animationDelay: `${idx * 60}ms` }}>
            <div className={styles.pinnedCardHeader}>
              <div className={styles.pinnedAvatar}>{c.student_name[0]}</div>
              <div className={styles.pinnedMeta}>
                <span className={styles.pinnedName}>{c.student_name}</span>
                {!anonymous && <span className={styles.pinnedId}>{c.student_id}</span>}
              </div>
              <span className={styles.pinnedDot}>📌</span>
            </div>
            <div className={styles.pinnedContent}>{c.content}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function ForumPage() {
  const router = useRouter()
  const params = useParams()
  const forumId = params.id as string
  const supabase = createClient()

  const [student, setStudent] = useState<{ id: string; name: string } | null>(null)
  const [isTeacher, setIsTeacher] = useState(false)
  const [teacherName, setTeacherName] = useState('')

  const [forum, setForum] = useState<Forum | null>(null)
  const [comments, setComments] = useState<Comment[]>([])
  const [commentInput, setCommentInput] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [activeMedia, setActiveMedia] = useState(0)
  const [passwordInput, setPasswordInput] = useState('')
  const [passwordPassed, setPasswordPassed] = useState(false)
  const [passwordError, setPasswordError] = useState(false)
  const [togglingComments, setTogglingComments] = useState(false)
  const [pinningId, setPinningId] = useState<number | null>(null)
  const commentsEndRef = useRef<HTMLDivElement>(null)
  const [mobileCommentOpen, setMobileCommentOpen] = useState(false)
  // 대댓글
  const [replyingTo, setReplyingTo] = useState<Comment | null>(null)
  const [togglingReplies, setTogglingReplies] = useState(false)

  // Poll state
  const [allPolls, setAllPolls] = useState<Poll[]>([])
  const [activePoll, setActivePoll] = useState<Poll | null>(null)
  const [pollResponses, setPollResponses] = useState<PollResponse[]>([])
  const [pollAnswer, setPollAnswer] = useState('')
  const [pollSubmitted, setPollSubmitted] = useState(false)
  const [pollSubmitting, setPollSubmitting] = useState(false)
  const [pollTimeLeft, setPollTimeLeft] = useState<number | null>(null)
  const [showPollPanel, setShowPollPanel] = useState(false)
  const [launchingId, setLaunchingId] = useState<string | null>(null)
  // 결과 공개: 학생이 직접 팝업 닫았는지 여부 (닫은 후엔 재등장 X)
  const [studentClosedResult, setStudentClosedResult] = useState(false)
  const [studentClosedPoll, setStudentClosedPoll] = useState(false)
  // 교사용 결과 팝업 표시 여부
  const [teacherShowResultPopup, setTeacherShowResultPopup] = useState(false)
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  /* ── Auth ── */
  useEffect(() => {
    const teacher = sessionStorage.getItem('ph_teacher')
    const studentRaw = sessionStorage.getItem('ph_student')
    if (teacher) {
      setIsTeacher(true)
      setTeacherName(teacher)
      setPasswordPassed(true)
    } else if (studentRaw) {
      setStudent(JSON.parse(studentRaw))
    } else {
      router.replace('/')
    }
  }, [router])

  /* ── Load forum ── */
  useEffect(() => {
    async function load() {
      const { data } = await supabase.from('forums').select('*').eq('id', forumId).single()
      if (data) setForum(data)
    }
    load()
  }, [forumId, supabase])

  /* ── Realtime: comments INSERT + UPDATE ── */
  useEffect(() => {
    const channel = supabase
      .channel(`forum_comments_${forumId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'forum_comments',
        filter: `forum_id=eq.${forumId}`,
      }, (payload) => {
        setComments(prev => [...prev, payload.new as Comment])
      })
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'forum_comments',
        filter: `forum_id=eq.${forumId}`,
      }, (payload) => {
        setComments(prev => prev.map(c => c.id === (payload.new as Comment).id ? { ...c, ...(payload.new as Comment) } : c))
      })
      .on('postgres_changes', {
        event: 'DELETE', schema: 'public', table: 'forum_comments',
        filter: `forum_id=eq.${forumId}`,
      }, (payload) => {
        setComments(prev => prev.filter(c => c.id !== (payload.old as Comment).id))
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [forumId, supabase])

  /* ── Realtime: forum UPDATE ── */
  useEffect(() => {
    const channel = supabase
      .channel(`forum_state_${forumId}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'forums',
        filter: `id=eq.${forumId}`,
      }, (payload) => {
        setForum(prev => prev ? { ...prev, ...payload.new } : prev)
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [forumId, supabase])

  /* ── Load comments ── */
  const loadComments = useCallback(async () => {
    const { data } = await supabase.from('forum_comments')
      .select('*').eq('forum_id', forumId).order('created_at', { ascending: true })
    if (data) setComments(data)
  }, [forumId, supabase])

  useEffect(() => { loadComments() }, [loadComments])

  /* ── Poll: 전체 목록 + 활성 설문 초기 로드 ── */
  useEffect(() => {
    async function loadPolls() {
      const { data } = await supabase.from('forum_polls')
        .select('*').eq('forum_id', forumId).order('created_at')
      if (data) {
        setAllPolls(data)
        const active = data.find((p: Poll) => p.is_active) ?? null
        if (active) {
          setActivePoll(active)
          setPollSubmitted(false)
          setPollAnswer('')
        }
      }
    }
    loadPolls()

    const channel = supabase
      .channel(`forum_poll_${forumId}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'forum_polls',
        filter: `forum_id=eq.${forumId}`,
      }, (payload) => {
        const updated = payload.new as Poll
        setAllPolls(prev => prev.map(p => p.id === updated.id ? updated : p))
        if (updated.is_active) {
          setActivePoll(prev => {
            // 이전과 다른 설문 ID일 때만 "새 설문"으로 간주하여 닫힘 상태 리셋
            const isNewPoll = prev?.id !== updated.id
            if (isNewPoll) {
              setPollSubmitted(false)
              setPollAnswer('')
              setStudentClosedResult(false)
              setStudentClosedPoll(false)
            }
            return updated
          })
        } else {
          setActivePoll(prev => {
            if (prev?.id === updated.id) {
              // 종료 시 show_result도 반영
              return { ...prev, ...updated }
            }
            return prev
          })
          // is_active=false가 됐을 때 activePoll 제거 타이밍:
          // show_result가 true라면 결과 팝업은 유지 (activePoll은 남겨둠)
          if (!updated.show_result) {
            setActivePoll(prev => prev?.id === updated.id ? null : prev)
          }
        }
      })
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'forum_polls',
        filter: `forum_id=eq.${forumId}`,
      }, (payload) => {
        setAllPolls(prev => [...prev, payload.new as Poll])
      })
      .on('postgres_changes', {
        event: 'DELETE', schema: 'public', table: 'forum_polls',
        filter: `forum_id=eq.${forumId}`,
      }, (payload) => {
        setAllPolls(prev => prev.filter(p => p.id !== (payload.old as Poll).id))
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [forumId, supabase])

  /* ── Poll 타이머 ── */
  useEffect(() => {
    if (pollTimerRef.current) clearInterval(pollTimerRef.current)
    if (!activePoll?.time_limit) { setPollTimeLeft(null); return }
    setPollTimeLeft(activePoll.time_limit)
    pollTimerRef.current = setInterval(() => {
      setPollTimeLeft(prev => {
        if (prev === null || prev <= 1) { clearInterval(pollTimerRef.current!); return null }
        return prev - 1
      })
    }, 1000)
    return () => { if (pollTimerRef.current) clearInterval(pollTimerRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePoll?.id])

  /* ── Poll 응답 실시간 구독 (교사 + 학생 모두) ── */
  useEffect(() => {
    if (!activePoll) { setPollResponses([]); return }
    async function loadResponses() {
      const { data } = await supabase.from('forum_poll_responses').select('*').eq('poll_id', activePoll!.id)
      if (data) setPollResponses(data)
    }
    loadResponses()
    const channel = supabase
      .channel(`poll_resp_${activePoll.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'forum_poll_responses',
        filter: `poll_id=eq.${activePoll.id}`,
      }, (payload) => {
        setPollResponses(prev => {
          const exists = prev.find(r => r.id === (payload.new as PollResponse).id)
          return exists ? prev : [...prev, payload.new as PollResponse]
        })
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [activePoll?.id, supabase])

  async function submitPollAnswer() {
    if (!activePoll || !student || pollSubmitting || pollSubmitted) return
    if (!pollAnswer.trim()) return
    setPollSubmitting(true)
    const { error } = await supabase.from('forum_poll_responses').upsert({
      poll_id: activePoll.id,
      student_id: student.id,
      student_name: student.name,
      answer: pollAnswer.trim(),
    }, { onConflict: 'poll_id,student_id' })
    if (!error) setPollSubmitted(true)
    setPollSubmitting(false)
  }

  async function launchPoll(pollId: string) {
    if (launchingId) return
    setLaunchingId(pollId)
    await supabase.from('forum_polls').update({ is_active: false, show_result: false }).eq('forum_id', forumId)
    await supabase.from('forum_poll_responses').delete().eq('poll_id', pollId)
    await supabase.from('forum_polls').update({ is_active: true, show_result: false }).eq('id', pollId)
    // Realtime과 무관하게 로컬 state 즉시 반영
    const target = allPolls.find(p => p.id === pollId)
    if (target) {
      const launched = { ...target, is_active: true, show_result: false }
      setActivePoll(launched)
      setAllPolls(prev => prev.map(p => ({ ...p, is_active: p.id === pollId, show_result: false })))
    }
    setPollResponses([])
    setStudentClosedResult(false)
    setStudentClosedPoll(false)
    setTeacherShowResultPopup(false)
    setShowPollPanel(false)
    setLaunchingId(null)
  }

  async function closePoll() {
    if (!activePoll) return
    await supabase.from('forum_polls').update({ is_active: false }).eq('id', activePoll.id)
    // show_result가 true였으면 유지(결과 계속 보임), false였으면 activePoll 클리어
    if (!activePoll.show_result) {
      setActivePoll(null)
      setPollResponses([])
    } else {
      setActivePoll(prev => prev ? { ...prev, is_active: false } : null)
    }
  }

  async function showPollResult() {
    if (!activePoll) return
    await supabase.from('forum_polls').update({ show_result: true }).eq('id', activePoll.id)
    setActivePoll(prev => prev ? { ...prev, show_result: true } : null)
    setTeacherShowResultPopup(true)
  }

  async function hidePollResult() {
    if (!activePoll) return
    await supabase.from('forum_polls').update({ show_result: false }).eq('id', activePoll.id)
    setActivePoll(prev => prev ? { ...prev, show_result: false } : null)
    setTeacherShowResultPopup(false)
    // 설문이 이미 종료됐다면 activePoll도 클리어
    if (!activePoll.is_active) {
      setActivePoll(null)
      setPollResponses([])
    }
  }

  /* ── Auto scroll ── */
  useEffect(() => {
    commentsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [comments])

  /* ── 댓글 ON/OFF 토글 ── */
  async function toggleComments() {
    if (!forum || togglingComments) return
    setTogglingComments(true)
    const newVal = !forum.comments_enabled
    await supabase.from('forums').update({ comments_enabled: newVal }).eq('id', forumId)
    setForum(prev => prev ? { ...prev, comments_enabled: newVal } : prev)
    setTogglingComments(false)
  }

  /* ── 대댓글 ON/OFF 토글 (교사 전용) ── */
  async function toggleReplies() {
    if (!forum || togglingReplies) return
    setTogglingReplies(true)
    const newVal = !forum.replies_enabled
    await supabase.from('forums').update({ replies_enabled: newVal }).eq('id', forumId)
    setForum(prev => prev ? { ...prev, replies_enabled: newVal } : prev)
    setTogglingReplies(false)
  }

  /* ── 댓글 핀 토글 (교사 전용) ── */
  async function togglePin(comment: Comment) {
    if (pinningId === comment.id) return
    setPinningId(comment.id)
    const newVal = !comment.is_pinned
    const { error } = await supabase.from('forum_comments')
      .update({ is_pinned: newVal })
      .eq('id', comment.id)
    if (!error) {
      setComments(prev => prev.map(c => c.id === comment.id ? { ...c, is_pinned: newVal } : c))
    }
    setPinningId(null)
  }

  /* ── 댓글 삭제 ── */
  async function deleteComment(id: number) {
    await supabase.from('forum_comments').delete().eq('id', id)
    setComments(prev => prev.filter(c => c.id !== id))
  }

  async function submitComment() {
    if (!student || !commentInput.trim() || submitting) return
    if (!forum?.comments_enabled) return
    setSubmitting(true)
    const isAnon = forum?.anonymous ?? false
    const { error } = await supabase.from('forum_comments').insert({
      forum_id: forumId,
      student_id: student.id,
      student_name: isAnon ? '익명' : student.name,
      content: commentInput.trim(),
      parent_id: replyingTo?.id ?? null,
    })
    if (!error) {
      setCommentInput('')
      setReplyingTo(null)
    }
    setSubmitting(false)
  }

  function checkPassword() {
    if (passwordInput === forum?.password) { setPasswordPassed(true); setPasswordError(false) }
    else setPasswordError(true)
  }

  function formatTime(iso: string) {
    return new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
  }
  function formatDate(iso: string) {
    const d = new Date(iso)
    if (d.toDateString() === new Date().toDateString()) return formatTime(iso)
    return d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' }) + ' ' + formatTime(iso)
  }

  if (!forum || (!student && !isTeacher)) return <div className="loading-center">로딩 중...</div>

  if (forum.password && !passwordPassed && !isTeacher) return (
    <div className={styles.passwordPage}>
      <div className={styles.passwordBox}>
        <div className={styles.passwordIcon}>🔒</div>
        <div className={styles.passwordTitle}>{forum.title}</div>
        <div className={styles.passwordDesc}>입장 비밀번호를 입력하세요.</div>
        <input className={styles.passwordInput} type="password" value={passwordInput}
          onChange={e => setPasswordInput(e.target.value)} placeholder="비밀번호"
          onKeyDown={e => e.key === 'Enter' && checkPassword()} />
        {passwordError && <div className={styles.passwordError}>비밀번호가 올바르지 않습니다.</div>}
        <button className={styles.btnPasswordEnter} onClick={checkPassword}>입장하기</button>
        <button className={styles.btnPasswordBack} onClick={() => router.push('/student')}>← 돌아가기</button>
      </div>
    </div>
  )

  const mediaItems: MediaItem[] = forum.media_items || []
  const commentsOn = forum.comments_enabled !== false
  const repliesOn = forum.replies_enabled !== false
  const pinnedComments = comments.filter(c => c.is_pinned)
  // 최상위 댓글만 추출하고, 각 댓글의 대댓글 목록 매핑
  const topLevelComments = comments.filter(c => !c.parent_id)
  const getReplies = (parentId: number) => comments.filter(c => c.parent_id === parentId)

  /* ── 댓글 단건 렌더 (데스크탑·모바일 공용) ── */
  function renderCommentItem(c: Comment, isReply = false) {
    const isMe = !isTeacher && c.student_id === student?.id
    const isPinned = !!c.is_pinned
    const replies = isReply ? [] : getReplies(c.id)
    const canReply = !isTeacher && !isReply && commentsOn && repliesOn
    const isReplyingToThis = replyingTo?.id === c.id
    return (
      <div key={c.id} className={`${styles.commentItem} ${isMe ? styles.commentItemMe : ''} ${isPinned ? styles.commentItemPinned : ''} ${isReply ? styles.replyItem : ''}`}>
        <div className={styles.commentMeta}>
          <div className={`${styles.commentAvatar} ${isMe ? styles.commentAvatarMe : ''} ${isPinned ? styles.commentAvatarPinned : ''} ${isReply ? styles.replyAvatar : ''}`}>
            {c.student_name[0]}
          </div>
          <div className={styles.commentInfo}>
            <span className={styles.commentName}>{c.student_name}</span>
            {!forum?.anonymous && <span className={styles.commentId}>{c.student_id}</span>}
            {isPinned && <span className={styles.pinnedBadge}>📌 표시 중</span>}
          </div>
          <span className={styles.commentTime}>{formatDate(c.created_at)}</span>
          {isTeacher && (
            <div className={styles.teacherCommentBtns}>
              {!isReply && (
                <button
                  className={`${styles.btnPinComment} ${isPinned ? styles.btnPinCommentActive : ''}`}
                  onClick={() => togglePin(c)}
                  disabled={pinningId === c.id}
                  title={isPinned ? '화면에서 내리기' : '화면에 포인트 표시'}
                >
                  {pinningId === c.id ? '...' : isPinned ? '📌' : '📍'}
                </button>
              )}
              <button className={styles.btnDeleteComment} onClick={() => deleteComment(c.id)}>🗑</button>
            </div>
          )}
        </div>
        <div className={`${styles.commentBubble} ${isMe ? styles.commentBubbleMe : ''} ${isPinned ? styles.commentBubblePinned : ''} ${isReply ? styles.replyBubble : ''}`}>
          {c.content}
        </div>
        {/* 대댓글 달기 버튼 */}
        {canReply && (
          <button
            className={`${styles.btnReply} ${isReplyingToThis ? styles.btnReplyActive : ''}`}
            onClick={() => setReplyingTo(isReplyingToThis ? null : c)}
          >
            {isReplyingToThis ? '↩ 취소' : '↩ 답글'}
          </button>
        )}
        {/* 대댓글 목록 */}
        {replies.length > 0 && (
          <div className={styles.repliesList}>
            {replies.map(r => renderCommentItem(r, true))}
          </div>
        )}
      </div>
    )
  }

  /* ── 입력창 렌더 (데스크탑·모바일 공용) ── */
  function renderInputArea() {
    if (isTeacher) return null
    if (!commentsOn) return (
      <div className={styles.commentsOffBox}>🔇 현재 교사가 댓글을 비활성화했습니다.</div>
    )
    return (
      <div className={styles.commentInputBox}>
        {replyingTo && (
          <div className={styles.replyingToBar}>
            <span className={styles.replyingToLabel}>↩ {replyingTo.student_name}에게 답글</span>
            <button className={styles.replyingToClear} onClick={() => setReplyingTo(null)}>✕</button>
          </div>
        )}
        <div className={styles.commentInputRow}>
          <textarea
            className={styles.commentInput}
            value={commentInput}
            onChange={e => setCommentInput(e.target.value)}
            placeholder={replyingTo ? `${replyingTo.student_name}에게 답글...` : '의견을 입력하세요...'}
            rows={2}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitComment() } }}
          />
          <button className={styles.btnSend} onClick={submitComment} disabled={submitting || !commentInput.trim()}>
            {submitting ? '...' : '전송'}
          </button>
        </div>
      </div>
    )
  }

  /* ── 학생/교사 공통 결과 렌더 헬퍼 ── */
  function renderResultContent(poll: Poll, responses: PollResponse[], total: number) {
    if (poll.poll_type === 'choice') {
      return (
        <div className={styles.pollResultBars}>
          {poll.options.map((opt, i) => {
            const cnt = responses.filter(r => r.answer === opt).length
            const pct = total ? Math.round(cnt / total * 100) : 0
            return (
              <div key={i} className={styles.pollResultBar}>
                <span className={styles.pollResultBarLabel}>{opt}</span>
                <div className={styles.pollResultBarTrack}>
                  <div className={styles.pollResultBarFill} style={{ width: `${pct}%` }} />
                </div>
                <span className={styles.pollResultBarStat}>{cnt}명 {pct}%</span>
              </div>
            )
          })}
        </div>
      )
    }
    return (
      <div className={styles.pollResultAnswers}>
        {responses.length === 0
          ? <span className={styles.pollResultEmpty}>아직 응답이 없습니다.</span>
          : responses.map((r, i) => (
            <div key={i} className={styles.pollResultAnswerChip}>
              <span className={styles.pollResultAnswerName}>{r.student_name}</span>
              <span className={styles.pollResultAnswerText}>{r.answer}</span>
            </div>
          ))
        }
      </div>
    )
  }

  /* ── 학생용 팝업 ── */
  function renderStudentPoll() {
    if (isTeacher || !activePoll) return null

    // 결과 공개 중이고 학생이 아직 안 닫은 경우 → 결과 팝업
    if (activePoll.show_result && !studentClosedResult) {
      const total = pollResponses.length
      return (
        <div className={styles.pollOverlay}>
          <div className={styles.pollBox}>
            <div className={styles.pollBoxHeader}>
              <span className={styles.pollBoxBadge} style={{ background: '#0f766e' }}>📊 설문 결과</span>
              <button className={styles.pollResultCloseBtn} onClick={() => setStudentClosedResult(true)}>✕ 닫기</button>
            </div>
            <div className={styles.pollQuestion}>{activePoll.question}</div>
            <div className={styles.pollResultMeta}>{total}명 응답</div>
            {renderResultContent(activePoll, pollResponses, total)}
          </div>
        </div>
      )
    }

    // 진행 중인 설문 (응답 팝업) — 학생이 닫았으면 표시 안 함
    if (!activePoll.is_active || studentClosedPoll) return null
    const timerPct = (activePoll.time_limit && pollTimeLeft !== null)
      ? (pollTimeLeft / activePoll.time_limit) * 100 : null
    return (
      <div className={styles.pollOverlay}>
        <div className={styles.pollBox}>
          <div className={styles.pollBoxHeader}>
            <span className={styles.pollBoxBadge}>📊 설문조사</span>
            <div className={styles.pollBoxHeaderRight}>
              {timerPct !== null && (
                <span className={styles.pollBoxTimer} style={{ color: timerPct < 25 ? '#ef4444' : timerPct < 50 ? '#f59e0b' : '#7c5cbf' }}>
                  {pollTimeLeft}초
                </span>
              )}
              <button className={styles.pollResultCloseBtn} onClick={() => setStudentClosedPoll(true)}>✕</button>
            </div>
          </div>
          {timerPct !== null && (
            <div className={styles.pollTimerBar}>
              <div className={styles.pollTimerFill} style={{ width: `${timerPct}%`, background: timerPct < 25 ? '#ef4444' : timerPct < 50 ? '#f59e0b' : '#7c5cbf' }} />
            </div>
          )}
          <div className={styles.pollQuestion}>{activePoll.question}</div>
          {pollSubmitted ? (
            <div className={styles.pollDone}>
              <div className={styles.pollDoneIcon}>✅</div>
              <div className={styles.pollDoneText}>응답이 제출되었습니다!</div>
              <button className={styles.pollDoneClose} onClick={() => setStudentClosedPoll(true)}>닫기</button>
            </div>
          ) : activePoll.poll_type === 'choice' ? (
            <div className={styles.pollChoices}>
              {activePoll.options.map((opt, i) => (
                <button key={i}
                  className={`${styles.pollChoiceBtn} ${pollAnswer === opt ? styles.pollChoiceBtnSelected : ''}`}
                  onClick={() => setPollAnswer(opt)}
                >
                  <span className={styles.pollChoiceLetter}>{String.fromCharCode(65 + i)}</span>
                  {opt}
                </button>
              ))}
              <button className={styles.btnPollSubmit} onClick={submitPollAnswer} disabled={!pollAnswer || pollSubmitting}>
                {pollSubmitting ? '제출중...' : '제출하기'}
              </button>
            </div>
          ) : (
            <div className={styles.pollTextInput}>
              <textarea className={styles.pollTextarea} value={pollAnswer}
                onChange={e => setPollAnswer(e.target.value)}
                placeholder="답변을 입력하세요..." rows={3} />
              <button className={styles.btnPollSubmit} onClick={submitPollAnswer} disabled={!pollAnswer.trim() || pollSubmitting}>
                {pollSubmitting ? '제출중...' : '제출하기'}
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  /* ── 교사용 결과 팝업 ── */
  function renderTeacherResultPopup() {
    if (!isTeacher || !activePoll || !teacherShowResultPopup) return null
    const total = pollResponses.length
    return (
      <div className={styles.pollOverlay}>
        <div className={styles.pollBox}>
          <div className={styles.pollBoxHeader}>
            <span className={styles.pollBoxBadge} style={{ background: '#0f766e' }}>📊 설문 결과 (미리보기)</span>
            <button className={styles.pollResultCloseBtn} onClick={() => setTeacherShowResultPopup(false)}>✕ 닫기</button>
          </div>
          <div className={styles.pollQuestion}>{activePoll.question}</div>
          <div className={styles.pollResultMeta}>{total}명 응답</div>
          {renderResultContent(activePoll, pollResponses, total)}
        </div>
      </div>
    )
  }

  /* ── 모바일 댓글 바텀시트 ── */
  function renderMobileCommentSheet() {
    return (
      <>
        {/* 댓글 열기 FAB */}
        <button
          className={`${styles.mobileCommentFab} ${mobileCommentOpen ? styles.mobileCommentFabHidden : ''}`}
          onClick={() => setMobileCommentOpen(true)}
        >
          <span className={styles.mobileCommentFabIcon}>💬</span>
          <span className={styles.mobileCommentFabLabel}>댓글 {comments.length > 0 ? `${comments.length}개` : '보기'}</span>
        </button>

        {/* 딤 배경 */}
        {mobileCommentOpen && (
          <div className={styles.mobileSheetDim} onClick={() => setMobileCommentOpen(false)} />
        )}

        {/* 바텀시트 */}
        <div className={`${styles.mobileCommentSheet} ${mobileCommentOpen ? styles.mobileCommentSheetOpen : ''}`}>
          {/* 핸들 + 헤더 */}
          <div className={styles.mobileSheetHeader} onClick={() => setMobileCommentOpen(false)}>
            <div className={styles.mobileSheetHandle} />
            <div className={styles.mobileSheetTitle}>
              <span>💬 실시간 토론</span>
              <span className={styles.commentCount}>{comments.length}개</span>
              {!commentsOn && <span className={styles.commentsOffBadge}>🔇 비활성</span>}
            </div>
          </div>

          {/* 학생 정체성 */}
          {!isTeacher && (
            <div className={styles.myIdentity}>
              <div className={styles.myAvatar}>{forum!.anonymous ? '?' : student!.name[0]}</div>
              <div>
                <div className={styles.myName}>{forum!.anonymous ? '익명으로 참여 중' : student!.name}</div>
                <div className={styles.myId}>{forum!.anonymous ? '댓글이 익명으로 표시됩니다' : student!.id}</div>
              </div>
            </div>
          )}
          {isTeacher && (
            <div className={`${styles.myIdentity} ${styles.teacherIdentity}`}>
              <div className={`${styles.myAvatar} ${styles.teacherAvatar}`}>👩‍🏫</div>
              <div>
                <div className={styles.myName}>교사 관리 모드</div>
                <div className={styles.myId}>댓글 {commentsOn ? '활성화' : '비활성화'} 상태</div>
              </div>
            </div>
          )}

          {/* 댓글 목록 */}
          <div className={styles.mobileSheetList}>
            {topLevelComments.length === 0 && (
              <div className={styles.commentsEmpty}>
                아직 댓글이 없어요.<br />
                {commentsOn ? '첫 번째로 의견을 남겨보세요!' : '교사가 댓글을 활성화하면 참여할 수 있어요.'}
              </div>
            )}
            {topLevelComments.map(c => renderCommentItem(c))}
            <div ref={commentsEndRef} />
          </div>

          {/* 입력창 */}
          {renderInputArea()}
        </div>
      </>
    )
  }

  return (
    <div className={styles.page}>
      {/* 학생용 설문 팝업 */}
      {renderStudentPoll()}
      {/* 교사용 결과 팝업 */}
      {renderTeacherResultPopup()}

      {/* Topbar */}
      <div className={styles.topbar}>
        <div className={styles.topbarLeft}>
          <div className={styles.logoIcon}>
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>
            </svg>
          </div>
          <span className={styles.siteName}>ProjectHub</span>
          <span className={styles.forumBadge}>FORUM</span>
        </div>
        <div className={styles.topbarRight}>
          {isTeacher
            ? <span className={styles.teacherTag}>🏫 {teacherName} 선생님</span>
            : <span className={styles.stuName}>{student!.name} ({student!.id})</span>
          }
          <button className={styles.btnBack}
            onClick={() => router.push(isTeacher ? '/teacher' : '/student')}>
            ← 나가기
          </button>
        </div>
      </div>

      {/* ── 교사 컨트롤 바 + 설문 패널 ── */}
      {isTeacher && (
        <div className={styles.teacherControlWrap}>
          {/* 컨트롤 바 */}
          <div className={styles.teacherControlBar}>
            <div className={styles.tcBarLeft}>
              <span className={styles.tcBarBadge}>👩‍🏫 교사 관리 모드</span>
              <span className={styles.tcBarInfo}>
                📌 댓글 클릭 → 화면 포인트 표시 · 학생에게 이 바는 보이지 않습니다
              </span>
            </div>
            <div className={styles.tcBarRight}>
              {pinnedComments.length > 0 && (
                <span className={styles.tcPinnedCount}>📌 {pinnedComments.length}개 표시 중</span>
              )}
              {/* 설문 버튼 */}
              {activePoll ? (
                <button className={styles.tcBtnPollActive} onClick={closePoll}>
                  🔴 설문 종료
                </button>
              ) : (
                <button
                  className={`${styles.tcBtnPoll} ${showPollPanel ? styles.tcBtnPollOpen : ''}`}
                  onClick={() => setShowPollPanel(v => !v)}
                  disabled={allPolls.length === 0}
                  title={allPolls.length === 0 ? '편집 화면에서 설문을 먼저 추가하세요' : ''}
                >
                  📊 설문 실시 {allPolls.length > 0 && `(${allPolls.length})`}
                </button>
              )}
              {/* 댓글 ON/OFF */}
              <div className={styles.tcToggleGroup}>
                <span className={styles.tcToggleLabel}>댓글</span>
                <button
                  className={`${styles.tcToggle} ${commentsOn ? styles.tcToggleOn : styles.tcToggleOff}`}
                  onClick={toggleComments} disabled={togglingComments}
                >
                  <div className={styles.tcToggleKnob} />
                </button>
                <span className={`${styles.tcToggleStatus} ${commentsOn ? styles.tcStatusOn : styles.tcStatusOff}`}>
                  {commentsOn ? 'ON' : 'OFF'}
                </span>
              </div>
              {/* 대댓글 ON/OFF */}
              <div className={styles.tcToggleGroup}>
                <span className={styles.tcToggleLabel}>답글</span>
                <button
                  className={`${styles.tcToggle} ${repliesOn ? styles.tcToggleOn : styles.tcToggleOff}`}
                  onClick={toggleReplies} disabled={togglingReplies || !commentsOn}
                  title={!commentsOn ? '댓글이 비활성화 상태입니다' : ''}
                >
                  <div className={styles.tcToggleKnob} />
                </button>
                <span className={`${styles.tcToggleStatus} ${repliesOn && commentsOn ? styles.tcStatusOn : styles.tcStatusOff}`}>
                  {repliesOn && commentsOn ? 'ON' : 'OFF'}
                </span>
              </div>
              <button className={styles.tcBtnEdit}
                onClick={() => { sessionStorage.setItem('ph_forum_edit', forumId); router.push('/teacher') }}>
                ✏️ 포럼 편집
              </button>
            </div>
          </div>

          {/* ── 설문 선택 드롭다운 패널 ── */}
          {showPollPanel && !activePoll && (
            <div className={styles.pollSelectPanel}>
              <div className={styles.pollSelectTitle}>📋 실시할 설문조사를 선택하세요</div>
              <div className={styles.pollSelectList}>
                {allPolls.map(poll => (
                  <div key={poll.id} className={styles.pollSelectItem}>
                    <div className={styles.pollSelectInfo}>
                      <span className={styles.pollSelectBadge}>{poll.poll_type === 'choice' ? '선택형' : '단답형'}</span>
                      {poll.time_limit && <span className={styles.pollSelectTime}>⏱ {poll.time_limit}초</span>}
                      <span className={styles.pollSelectQ}>{poll.question}</span>
                    </div>
                    <button
                      className={styles.btnPollGo}
                      onClick={() => launchPoll(poll.id)}
                      disabled={launchingId === poll.id}
                    >
                      {launchingId === poll.id ? '전송중...' : '▶ 실시'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── 교사 실시간 결과 패널 (진행중일 때) ── */}
          {activePoll && (() => {
            const total = pollResponses.length
            const timerPct = (activePoll.time_limit && pollTimeLeft !== null)
              ? (pollTimeLeft / activePoll.time_limit) * 100 : null
            return (
              <div className={styles.pollLivePanel}>
                <div className={styles.pollLivePanelHeader}>
                  <div className={styles.pollLiveLeft}>
                    <span className={styles.pollLiveBadge}>🔴 진행중</span>
                    <span className={styles.pollLiveQ}>{activePoll.question}</span>
                    <span className={styles.pollLiveCount}>{total}명 응답</span>
                  </div>
                  <div className={styles.pollLiveActions}>
                    {/* 결과 공개 / 공개 종료 버튼 */}
                    {activePoll.show_result ? (
                      <button className={styles.btnHideResult} onClick={hidePollResult}>
                        🙈 결과 공개 종료
                      </button>
                    ) : (
                      <button className={styles.btnShowResult} onClick={showPollResult}>
                        👁 학생에게 결과 공개
                      </button>
                    )}
                    {timerPct !== null && (
                      <div className={styles.pollLiveTimerWrap}>
                        <span className={styles.pollLiveTimerNum} style={{ color: timerPct < 25 ? '#ef4444' : timerPct < 50 ? '#f59e0b' : '#7c5cbf' }}>
                          {pollTimeLeft}초
                        </span>
                        <div className={styles.pollLiveTimerBar}>
                          <div className={styles.pollLiveTimerFill} style={{ width: `${timerPct}%`, background: timerPct < 25 ? '#ef4444' : timerPct < 50 ? '#f59e0b' : '#7c5cbf' }} />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                {activePoll.poll_type === 'choice' ? (
                  <div className={styles.pollLiveBars}>
                    {activePoll.options.map((opt, i) => {
                      const cnt = pollResponses.filter(r => r.answer === opt).length
                      const pct = total ? Math.round(cnt / total * 100) : 0
                      return (
                        <div key={i} className={styles.pollLiveBar}>
                          <span className={styles.pollLiveBarLabel}>{opt}</span>
                          <div className={styles.pollLiveBarTrack}>
                            <div className={styles.pollLiveBarFill} style={{ width: `${pct}%` }} />
                          </div>
                          <span className={styles.pollLiveBarStat}>{cnt}명 {pct}%</span>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className={styles.pollLiveAnswers}>
                    {pollResponses.length === 0
                      ? <span className={styles.pollLiveEmpty}>아직 응답이 없습니다...</span>
                      : pollResponses.map((r, i) => (
                        <div key={i} className={styles.pollLiveAnswerChip}>
                          <span className={styles.pollLiveAnswerName}>{r.student_name}</span>
                          <span className={styles.pollLiveAnswerText}>{r.answer}</span>
                        </div>
                      ))
                    }
                  </div>
                )}
              </div>
            )
          })()}
        </div>
      )}

      {/* Main layout */}
      <div className={styles.layout} style={{
        gridTemplateColumns: `${forum.layout_media ?? 62}fr ${forum.layout_comment ?? 38}fr`
      }}>
        {/* ── Left: Media + Pinned + Description ── */}
        <div className={styles.mediaPanel}>
          <h1 className={styles.forumHeading}>{forum.title}</h1>
          {forum.notice && <div className={styles.noticeBanner}>📢 {forum.notice}</div>}
          {mediaItems.length === 0 ? (
            <div className={styles.mediaEmpty}>미디어가 없습니다.</div>
          ) : (
            <>
              <div className={styles.mediaMain}>
                <DocViewer item={mediaItems[activeMedia]} />
              </div>
              {mediaItems.length > 1 && (
                <div className={styles.mediaThumbs}>
                  {mediaItems.map((item, i) => (
                    <button key={i}
                      className={`${styles.mediaThumb} ${activeMedia === i ? styles.mediaThumbActive : ''}`}
                      onClick={() => setActiveMedia(i)}>
                      {item.type === 'image' ? '🖼' : item.type === 'video' ? '▶' : item.type === 'pdf' ? '📄' : item.type === 'slides' ? '📊' : '🔗'}
                      <span>{item.caption || `미디어 ${i + 1}`}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {/* 📌 핀된 댓글 패널 — 미디어 아래, 모든 학생에게 표시 */}
          <PinnedCommentsPanel
            pinnedComments={pinnedComments}
            anonymous={forum.anonymous ?? false}
          />

          {forum.description && (
            <div className={styles.descBox}>
              <div className={styles.descLabel}>📋 설명</div>
              <div className={styles.descText}>{forum.description}</div>
            </div>
          )}
        </div>

        {/* ── Right: Comments (데스크탑만 표시) ── */}
        <div className={`${styles.commentPanel} ${styles.desktopCommentPanel}`}>
          <div className={styles.commentHeader}>
            <span className={styles.commentHeaderTitle}>💬 실시간 토론</span>
            <div className={styles.commentHeaderRight}>
              <span className={styles.commentCount}>{comments.length}개</span>
              {!commentsOn && <span className={styles.commentsOffBadge}>🔇 댓글 비활성</span>}
            </div>
          </div>

          {/* 학생 정체성 */}
          {!isTeacher && (
            <div className={styles.myIdentity}>
              <div className={styles.myAvatar}>{forum.anonymous ? '?' : student!.name[0]}</div>
              <div>
                <div className={styles.myName}>{forum.anonymous ? '익명으로 참여 중' : student!.name}</div>
                <div className={styles.myId}>{forum.anonymous ? '댓글이 익명으로 표시됩니다' : student!.id}</div>
              </div>
            </div>
          )}
          {isTeacher && (
            <div className={`${styles.myIdentity} ${styles.teacherIdentity}`}>
              <div className={`${styles.myAvatar} ${styles.teacherAvatar}`}>👩‍🏫</div>
              <div>
                <div className={styles.myName}>교사 관리 모드</div>
                <div className={styles.myId}>
                  📌 클릭 = 화면 포인트 표시 · 🗑 삭제 · 댓글 {commentsOn ? '활성화' : '비활성화'} 상태
                </div>
              </div>
            </div>
          )}

          {/* Comments list */}
          <div className={styles.commentsList} style={{ maxHeight: `${forum.comment_height ?? 70}vh` }}>
            {topLevelComments.length === 0 && (
              <div className={styles.commentsEmpty}>
                아직 댓글이 없어요.<br />
                {commentsOn ? '첫 번째로 의견을 남겨보세요!' : '교사가 댓글을 활성화하면 참여할 수 있어요.'}
              </div>
            )}
            {topLevelComments.map(c => renderCommentItem(c))}
            <div ref={commentsEndRef} />
          </div>

          {/* Input */}
          {renderInputArea()}
        </div>
      </div>

      {/* 모바일 댓글 바텀시트 */}
      <div className={styles.mobileOnly}>
        {renderMobileCommentSheet()}
      </div>
    </div>
  )
}
