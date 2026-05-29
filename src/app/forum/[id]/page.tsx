'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import styles from './forum.module.css'

interface MediaItem { type: 'video' | 'image' | 'embed'; url: string; caption: string }
interface Forum { id: string; title: string; description: string; media_items: MediaItem[]; subject_id: string; layout_media: number; layout_comment: number; comment_height: number }
interface Comment { id: number; student_id: string; student_name: string; content: string; created_at: string }

function MediaRenderer({ item }: { item: MediaItem }) {
  // YouTube URL 변환
  function toYouTubeEmbed(url: string) {
    const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/)
    return m ? `https://www.youtube.com/embed/${m[1]}` : null
  }
  // 일반 영상 확장자
  function isVideoFile(url: string) {
    return /\.(mp4|webm|ogg|mov)(\?|$)/i.test(url)
  }
  // 이미지 확장자
  function isImageFile(url: string) {
    return /\.(jpg|jpeg|png|gif|webp|svg)(\?|$)/i.test(url)
  }

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

  const [student, setStudent] = useState<{ id: string; name: string } | null>(null)
  const [forum, setForum] = useState<Forum | null>(null)
  const [comments, setComments] = useState<Comment[]>([])
  const [commentInput, setCommentInput] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [activeMedia, setActiveMedia] = useState(0)
  const commentsEndRef = useRef<HTMLDivElement>(null)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  /* ── Auth ── */
  useEffect(() => {
    const s = sessionStorage.getItem('ph_student')
    if (!s) { router.replace('/'); return }
    setStudent(JSON.parse(s))
  }, [router])

  /* ── Load forum ── */
  useEffect(() => {
    async function load() {
      const { data } = await supabase.from('forums').select('*').eq('id', forumId).single()
      if (data) setForum(data)
    }
    load()
  }, [forumId, supabase])

  /* ── Load comments ── */
  const loadComments = useCallback(async () => {
    const { data } = await supabase.from('forum_comments')
      .select('*').eq('forum_id', forumId).order('created_at', { ascending: true })
    if (data) setComments(data)
  }, [forumId, supabase])

  useEffect(() => { loadComments() }, [loadComments])

  /* ── Realtime subscription ── */
  useEffect(() => {
    const channel = supabase
      .channel(`forum_comments_${forumId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'forum_comments',
        filter: `forum_id=eq.${forumId}`,
      }, (payload) => {
        setComments(prev => [...prev, payload.new as Comment])
      })
      .subscribe()
    channelRef.current = channel
    return () => { supabase.removeChannel(channel) }
  }, [forumId, supabase])

  /* ── Auto scroll to bottom ── */
  useEffect(() => {
    commentsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [comments])

  async function submitComment() {
    if (!student || !commentInput.trim() || submitting) return
    setSubmitting(true)
    const { error } = await supabase.from('forum_comments').insert({
      forum_id: forumId,
      student_id: student.id,
      student_name: student.name,
      content: commentInput.trim(),
    })
    if (!error) setCommentInput('')
    setSubmitting(false)
  }

  function formatTime(iso: string) {
    return new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
  }
  function formatDate(iso: string) {
    const d = new Date(iso)
    const today = new Date()
    if (d.toDateString() === today.toDateString()) return formatTime(iso)
    return d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' }) + ' ' + formatTime(iso)
  }

  if (!student || !forum) return <div className="loading-center">로딩 중...</div>

  const mediaItems: MediaItem[] = forum.media_items || []

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
          <span className={styles.stuName}>{student.name} ({student.id})</span>
          <button className={styles.btnBack} onClick={() => router.push('/student')}>← 나가기</button>
        </div>
      </div>

      {/* Main layout */}
      <div className={styles.layout} style={{
        gridTemplateColumns: `${forum.layout_media ?? 62}fr ${forum.layout_comment ?? 38}fr`
      }}>
        {/* ── Left: Media + Description ── */}
        <div className={styles.mediaPanel}>
          {/* Media viewer */}
          {mediaItems.length === 0 ? (
            <div className={styles.mediaEmpty}>미디어가 없습니다.</div>
          ) : (
            <>
              <div className={styles.mediaMain}>
                <MediaRenderer item={mediaItems[activeMedia]} />
              </div>
              {/* Thumbnail strip */}
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

          {/* Description */}
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
            <span className={styles.commentCount}>{comments.length}개</span>
          </div>

          {/* My identity */}
          <div className={styles.myIdentity}>
            <div className={styles.myAvatar}>{student.name[0]}</div>
            <div>
              <div className={styles.myName}>{student.name}</div>
              <div className={styles.myId}>{student.id}</div>
            </div>
          </div>

          {/* Comments list */}
          <div className={styles.commentsList} style={{maxHeight: `${forum.comment_height ?? 70}vh`}}>
            {comments.length === 0 && (
              <div className={styles.commentsEmpty}>아직 댓글이 없어요.<br/>첫 번째로 의견을 남겨보세요!</div>
            )}
            {comments.map(c => {
              const isMe = c.student_id === student.id
              return (
                <div key={c.id} className={`${styles.commentItem} ${isMe ? styles.commentItemMe : ''}`}>
                  <div className={styles.commentMeta}>
                    <div className={`${styles.commentAvatar} ${isMe ? styles.commentAvatarMe : ''}`}>
                      {c.student_name[0]}
                    </div>
                    <div className={styles.commentInfo}>
                      <span className={styles.commentName}>{c.student_name}</span>
                      <span className={styles.commentId}>{c.student_id}</span>
                    </div>
                    <span className={styles.commentTime}>{formatDate(c.created_at)}</span>
                  </div>
                  <div className={`${styles.commentBubble} ${isMe ? styles.commentBubbleMe : ''}`}>
                    {c.content}
                  </div>
                </div>
              )
            })}
            <div ref={commentsEndRef} />
          </div>

          {/* Input */}
          <div className={styles.commentInputBox}>
            <textarea
              className={styles.commentInput}
              value={commentInput}
              onChange={e => setCommentInput(e.target.value)}
              placeholder="의견을 입력하세요..."
              rows={2}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitComment() }
              }}
            />
            <button className={styles.btnSend} onClick={submitComment} disabled={submitting || !commentInput.trim()}>
              {submitting ? '...' : '전송'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
