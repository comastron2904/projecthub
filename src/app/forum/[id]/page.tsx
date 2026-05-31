'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import styles from './forum.module.css'

interface MediaItem { type: 'video' | 'image' | 'embed'; url: string; caption: string }
interface Forum {
  id: string; title: string; description: string; media_items: MediaItem[]
  layout_media: number; layout_comment: number; comment_height: number
  anonymous: boolean; password: string; notice: string
  comments_enabled: boolean
}
interface Comment { id: number; student_id: string; student_name: string; content: string; created_at: string }

function MediaRenderer({ item }: { item: MediaItem }) {
  function toYouTubeEmbed(url: string) {
    const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/)
    return m ? `https://www.youtube.com/embed/${m[1]}` : null
  }
  function isVideoFile(url: string) { return /\.(mp4|webm|ogg|mov)(\?|$)/i.test(url) }
  function isImageFile(url: string) { return /\.(jpg|jpeg|png|gif|webp|svg)(\?|$)/i.test(url) }
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

export default function ForumPage() {
  const router = useRouter()
  const params = useParams()
  const forumId = params.id as string
  const supabase = createClient()

  // 학생 or 교사 세션
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
  const commentsEndRef = useRef<HTMLDivElement>(null)

  /* ── Auth: 학생 or 교사 모두 허용 ── */
  useEffect(() => {
    const teacher = sessionStorage.getItem('ph_teacher')
    const studentRaw = sessionStorage.getItem('ph_student')
    if (teacher) {
      setIsTeacher(true)
      setTeacherName(teacher)
      setPasswordPassed(true) // 교사는 비밀번호 스킵
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

  /* ── Realtime: comments INSERT ── */
  useEffect(() => {
    const channel = supabase
      .channel(`forum_comments_${forumId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'forum_comments',
        filter: `forum_id=eq.${forumId}`,
      }, (payload) => {
        setComments(prev => [...prev, payload.new as Comment])
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [forumId, supabase])

  /* ── Realtime: forum UPDATE (댓글 on/off 실시간 반영) ── */
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

  /* ── Auto scroll ── */
  useEffect(() => {
    commentsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [comments])

  /* ── 댓글 ON/OFF 토글 (교사 전용) ── */
  async function toggleComments() {
    if (!forum || togglingComments) return
    setTogglingComments(true)
    const newVal = !forum.comments_enabled
    await supabase.from('forums').update({ comments_enabled: newVal }).eq('id', forumId)
    setForum(prev => prev ? { ...prev, comments_enabled: newVal } : prev)
    setTogglingComments(false)
  }

  /* ── 댓글 삭제 (교사 전용) ── */
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
    })
    if (!error) setCommentInput('')
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

  // 비밀번호 화면 (학생만)
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
  const commentsOn = forum.comments_enabled !== false // 기본값 true

  return (
    <div className={styles.page}>
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
          <span className={styles.forumTitle}>{forum.title}</span>
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

      {/* ── 교사 컨트롤 바 ── */}
      {isTeacher && (
        <div className={styles.teacherControlBar}>
          <div className={styles.tcBarLeft}>
            <span className={styles.tcBarBadge}>👩‍🏫 교사 관리 모드</span>
            <span className={styles.tcBarInfo}>학생들에게는 이 바가 보이지 않습니다</span>
          </div>
          <div className={styles.tcBarRight}>
            {/* 댓글 ON/OFF */}
            <div className={styles.tcToggleGroup}>
              <span className={styles.tcToggleLabel}>댓글</span>
              <button
                className={`${styles.tcToggle} ${commentsOn ? styles.tcToggleOn : styles.tcToggleOff}`}
                onClick={toggleComments}
                disabled={togglingComments}
              >
                <div className={styles.tcToggleKnob} />
              </button>
              <span className={`${styles.tcToggleStatus} ${commentsOn ? styles.tcStatusOn : styles.tcStatusOff}`}>
                {commentsOn ? 'ON' : 'OFF'}
              </span>
            </div>
            {/* 포럼 편집 이동 */}
            <button className={styles.tcBtnEdit}
              onClick={() => { sessionStorage.setItem('ph_forum_edit', forumId); router.push('/teacher') }}>
              ✏️ 포럼 편집
            </button>
          </div>
        </div>
      )}

      {/* Main layout */}
      <div className={styles.layout} style={{
        gridTemplateColumns: `${forum.layout_media ?? 62}fr ${forum.layout_comment ?? 38}fr`
      }}>
        {/* ── Left: Media + Description ── */}
        <div className={styles.mediaPanel}>
          {forum.notice && <div className={styles.noticeBanner}>📢 {forum.notice}</div>}
          {mediaItems.length === 0 ? (
            <div className={styles.mediaEmpty}>미디어가 없습니다.</div>
          ) : (
            <>
              <div className={styles.mediaMain}>
                <MediaRenderer item={mediaItems[activeMedia]} />
              </div>
              {mediaItems.length > 1 && (
                <div className={styles.mediaThumbs}>
                  {mediaItems.map((item, i) => (
                    <button key={i}
                      className={`${styles.mediaThumb} ${activeMedia === i ? styles.mediaThumbActive : ''}`}
                      onClick={() => setActiveMedia(i)}>
                      {item.type === 'image' ? '🖼' : item.type === 'video' ? '▶' : '🔗'}
                      <span>{item.caption || `미디어 ${i + 1}`}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
          {forum.description && (
            <div className={styles.descBox}>
              <div className={styles.descLabel}>📋 설명</div>
              <div className={styles.descText}>{forum.description}</div>
            </div>
          )}
        </div>

        {/* ── Right: Comments ── */}
        <div className={styles.commentPanel}>
          <div className={styles.commentHeader}>
            <span className={styles.commentHeaderTitle}>💬 실시간 토론</span>
            <div className={styles.commentHeaderRight}>
              <span className={styles.commentCount}>{comments.length}개</span>
              {!commentsOn && <span className={styles.commentsOffBadge}>🔇 댓글 비활성</span>}
            </div>
          </div>

          {/* 학생 정체성 표시 */}
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
                <div className={styles.myId}>댓글 삭제 가능 · 댓글 {commentsOn ? '활성화' : '비활성화'} 상태</div>
              </div>
            </div>
          )}

          {/* Comments list */}
          <div className={styles.commentsList} style={{ maxHeight: `${forum.comment_height ?? 70}vh` }}>
            {comments.length === 0 && (
              <div className={styles.commentsEmpty}>
                아직 댓글이 없어요.<br />
                {commentsOn ? '첫 번째로 의견을 남겨보세요!' : '교사가 댓글을 활성화하면 참여할 수 있어요.'}
              </div>
            )}
            {comments.map(c => {
              const isMe = !isTeacher && c.student_id === student?.id
              return (
                <div key={c.id} className={`${styles.commentItem} ${isMe ? styles.commentItemMe : ''}`}>
                  <div className={styles.commentMeta}>
                    <div className={`${styles.commentAvatar} ${isMe ? styles.commentAvatarMe : ''}`}>
                      {c.student_name[0]}
                    </div>
                    <div className={styles.commentInfo}>
                      <span className={styles.commentName}>{c.student_name}</span>
                      {!forum.anonymous && <span className={styles.commentId}>{c.student_id}</span>}
                    </div>
                    <span className={styles.commentTime}>{formatDate(c.created_at)}</span>
                    {isTeacher && (
                      <button className={styles.btnDeleteComment} onClick={() => deleteComment(c.id)}>🗑</button>
                    )}
                  </div>
                  <div className={`${styles.commentBubble} ${isMe ? styles.commentBubbleMe : ''}`}>
                    {c.content}
                  </div>
                </div>
              )
            })}
            <div ref={commentsEndRef} />
          </div>

          {/* Input (학생만, 댓글 ON일 때) */}
          {!isTeacher && (
            commentsOn ? (
              <div className={styles.commentInputBox}>
                <textarea className={styles.commentInput} value={commentInput}
                  onChange={e => setCommentInput(e.target.value)}
                  placeholder="의견을 입력하세요..." rows={2}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitComment() } }} />
                <button className={styles.btnSend} onClick={submitComment} disabled={submitting || !commentInput.trim()}>
                  {submitting ? '...' : '전송'}
                </button>
              </div>
            ) : (
              <div className={styles.commentsOffBox}>
                🔇 현재 교사가 댓글을 비활성화했습니다.
              </div>
            )
          )}
        </div>
      </div>
    </div>
  )
}
