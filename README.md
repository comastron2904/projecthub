# 🎓 ProjectHub — 배포 가이드

> **Supabase(DB) + GitHub(소스) + Vercel(호스팅)** 으로 링크 하나로 접속 가능한 웹앱을 만드는 전체 가이드입니다.

---

## 📋 목차

1. [아키텍처 개요](#아키텍처-개요)
2. [STEP 1 — Supabase 설정](#step-1--supabase-설정)
3. [STEP 2 — GitHub 설정](#step-2--github-설정)
4. [STEP 3 — Vercel 배포](#step-3--vercel-배포)
5. [환경변수 설명](#환경변수-설명)
6. [데이터베이스 테이블 구조](#데이터베이스-테이블-구조)
7. [로컬 개발 환경](#로컬-개발-환경)

---

## 아키텍처 개요

```
[사용자 브라우저]
       ↕ HTTPS
[Vercel] — Next.js 앱 호스팅 (무료)
       ↕ API calls
[Supabase] — PostgreSQL DB + REST API (무료)
```

- **Supabase**: 데이터 저장 (과목/프로젝트/제출/교사계정)
- **GitHub**: 소스코드 보관, 변경 시 자동 재배포 트리거
- **Vercel**: 전 세계 CDN에 앱 배포, GitHub 연동 자동 배포

---

## STEP 1 — Supabase 설정

### 1-1. 프로젝트 생성

1. [https://supabase.com](https://supabase.com) 접속 → **Start your project** 클릭
2. GitHub 계정으로 로그인
3. **New project** 클릭
   - Organization: 기본값
   - Project name: `projecthub`
   - Database password: 강력한 비밀번호 설정 (어딘가에 메모)
   - Region: `Northeast Asia (Seoul)` 선택
4. **Create new project** 클릭 → 약 1분 대기

### 1-2. 데이터베이스 스키마 적용

1. Supabase 대시보드 좌측 메뉴 → **SQL Editor** 클릭
2. **New query** 클릭
3. 이 프로젝트의 `supabase_schema.sql` 파일 전체 내용을 복사하여 붙여넣기
4. **Run** (또는 Ctrl+Enter) 클릭
5. 성공 메시지 확인 ✅

### 1-3. API 키 복사

1. 좌측 메뉴 → **Project Settings** → **API**
2. 다음 두 값을 복사해 둡니다:
   - **Project URL**: `https://xxxxxxxxxxxx.supabase.co`
   - **anon public** 키: `eyJhbGci...` (긴 문자열)

---

## STEP 2 — GitHub 설정

### 2-1. 리포지토리 생성

1. [https://github.com](https://github.com) 로그인
2. 우측 상단 **+** → **New repository**
3. Repository name: `projecthub`
4. **Public** 또는 **Private** 선택 (둘 다 Vercel 무료 배포 가능)
5. **Create repository** 클릭

### 2-2. 코드 업로드

터미널(또는 Git Bash)에서 이 프로젝트 폴더로 이동 후 실행:

```bash
cd projecthub

# Git 초기화
git init
git add .
git commit -m "Initial commit"

# GitHub 리포지토리에 연결 (YOUR_USERNAME을 실제 GitHub 아이디로 교체)
git remote add origin https://github.com/YOUR_USERNAME/projecthub.git
git branch -M main
git push -u origin main
```

> ⚠️ `.env.local` 파일은 `.gitignore`에 등록되어 있어 자동으로 제외됩니다. 실제 키가 GitHub에 올라가지 않으니 안전합니다.

---

## STEP 3 — Vercel 배포

### 3-1. Vercel 프로젝트 생성

1. [https://vercel.com](https://vercel.com) 접속 → GitHub 계정으로 로그인
2. **Add New → Project** 클릭
3. GitHub 리포지토리 목록에서 `projecthub` 선택 → **Import** 클릭
4. Framework Preset: **Next.js** (자동 감지됨)

### 3-2. 환경변수 설정

**⚠️ 이 단계가 가장 중요합니다. `.env.local`은 GitHub에 올라가지 않으므로 Vercel에 직접 입력해야 합니다.**

**Environment Variables** 섹션에서 아래 3개를 추가:

| Name | Value |
|------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | Step 1-3에서 복사한 Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Step 1-3에서 복사한 anon public 키 |
| `NEXT_PUBLIC_TEACHER_CODE` | 교사 가입 인증코드 (예: `17561`, 원하는 숫자로 변경) |

### 3-3. 배포

**Deploy** 클릭 → 약 1~2분 대기

완료되면 `https://projecthub-xxxx.vercel.app` 형태의 URL이 생성됩니다! 🎉

### 3-4. 커스텀 도메인 (선택)

Vercel 대시보드 → 프로젝트 → **Settings → Domains**에서 원하는 도메인 연결 가능

---

## 환경변수 설명

| 변수명 | 설명 | 예시 |
|--------|------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL | `https://abc123.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase 공개 API 키 | `eyJhbGci...` |
| `NEXT_PUBLIC_TEACHER_CODE` | 교사 회원가입 시 필요한 인증코드 | `17561` |

---

## 데이터베이스 테이블 구조

| 테이블 | 용도 |
|--------|------|
| `teachers` | 교사 계정 (아이디/비밀번호) |
| `subjects` | 과목 목록 |
| `projects` | 프로젝트/가이드라인 (stages JSONB) |
| `submissions` | 학생 제출 기록 |
| `answer_drafts` | 학생 답변 자동저장 |

---

## 로컬 개발 환경

```bash
# 1. 의존성 설치
npm install

# 2. .env.local 파일 수정 (Supabase 실제 키 입력)
# NEXT_PUBLIC_SUPABASE_URL=https://...
# NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
# NEXT_PUBLIC_TEACHER_CODE=17561

# 3. 개발 서버 실행
npm run dev
# → http://localhost:3000 에서 확인
```

---

## 🔄 이후 업데이트 방법

코드를 수정한 뒤:
```bash
git add .
git commit -m "변경 내용 설명"
git push
```
GitHub에 push하면 Vercel이 자동으로 재배포합니다. (약 1분)

---

## 📞 문제 해결

| 증상 | 해결책 |
|------|--------|
| 배포 후 흰 화면 | Vercel 대시보드 → Functions 탭에서 에러 로그 확인 |
| 로그인 실패 | Supabase SQL Editor에서 `SELECT * FROM teachers;` 로 데이터 확인 |
| 데이터가 안 보임 | 환경변수 URL/Key 오타 확인 |
| DB 에러 | `supabase_schema.sql` 재실행 (DROP TABLE 없이 IF NOT EXISTS 사용 중이므로 안전) |
