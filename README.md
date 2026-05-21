# Image2Video Linux

Wan 2.2 Image-to-Video 풀스택 파이프라인. 텍스트 프롬프트 하나로 이미지를 생성하고, AI가 자동으로 모션을 분석해 고품질 영상을 만듭니다.

## 파이프라인 구조

```
Pollinations (이미지) → Gemini Vision (모션 프롬프트) → Wan 2.2 I2V (영상)
    → RIFE (프레임 보간) → Real-ESRGAN (업스케일) → FFmpeg (색보정 + 오디오)
```

## 주요 기능

- **무료 이미지 생성** — Pollinations API (API 키 불필요)
- **자동 모션 프롬프트** — Gemini Vision이 이미지를 분석해 최적의 카메라 동작 생성
- **Wan 2.2 I2V** — 오픈소스 최신 Image-to-Video 모델
- **CPU / GPU 선택** — GPU 없이도 CPU 모드로 실행 가능 (느림)
- **실시간 진행 상황** — WebSocket으로 추론 스텝별 진행률 스트리밍
- **프레임 보간** — RIFE로 16fps → 48fps 업샘플링
- **영상 업스케일** — Real-ESRGAN NCNN-Vulkan으로 최대 4배 고화질화
- **색보정 + 오디오** — FFmpeg EQ 필터 및 BGM 믹싱

## 스크린샷

| 설정 화면 | 작업 진행 화면 |
|:---------:|:-------------:|
| 프롬프트·해상도·디바이스 설정 | 단계별 진행바 + 실시간 로그 + 결과 미리보기 |

## 요구 사항

| 항목 | GPU 모드 | CPU 모드 |
|------|----------|----------|
| GPU | VRAM 16GB+ (RTX 3080 이상 권장) | 불필요 |
| RAM | 16GB+ | 32GB+ |
| 저장공간 | 30GB+ (모델 캐시) | 30GB+ |
| 소요 시간 | 5~15분/영상 | 수 시간/영상 |

- Python 3.10+
- Node.js 18+
- FFmpeg (`sudo apt install ffmpeg`)
- CUDA Toolkit (GPU 모드)

## 설치 및 실행

```bash
git clone https://github.com/david1005910/Image2Video_linux.git
cd Image2Video_linux
./run.sh
```

브라우저에서 http://localhost:5173 접속.

> 첫 실행 시 Wan 2.2 모델(~20 GB)을 자동 다운로드합니다. 20~40분 소요.

## 수동 실행

```bash
# 백엔드
cd backend
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000

# 프론트엔드 (별도 터미널)
cd frontend
npm install
npm run dev
```

## 선택 사항

**Gemini API 키** (모션 프롬프트 자동 생성)
- [Google AI Studio](https://aistudio.google.com)에서 무료 발급
- UI 폼의 "Gemini API 키" 입력란에 입력 (없으면 기본 프롬프트 사용)

**RIFE 프레임 보간** (FFmpeg보다 고품질)
```bash
mkdir -p backend/tools
git clone https://github.com/hzwer/Practical-RIFE backend/tools/Practical-RIFE
# 모델 가중치를 backend/tools/Practical-RIFE/train_log/ 에 배치
```

**Real-ESRGAN 업스케일**
```bash
mkdir -p backend/tools/realesrgan-ncnn-vulkan
# https://github.com/xinntao/Real-ESRGAN/releases 에서 리눅스용 바이너리 다운로드 후 배치
```

## 프로젝트 구조

```
Image2Video_linux/
├── run.sh                          # 백엔드 + 프론트엔드 한 번에 실행
├── backend/
│   ├── main.py                     # FastAPI (REST API + WebSocket)
│   ├── pipeline.py                 # 7단계 파이프라인 로직
│   ├── job_manager.py              # 작업 상태 관리 및 pub/sub
│   ├── schemas.py                  # Pydantic 데이터 모델
│   └── requirements.txt
├── frontend/
│   └── src/
│       ├── App.jsx                 # 레이아웃 (사이드바 + 메인)
│       └── components/
│           ├── ConfigForm.jsx      # 파이프라인 설정 폼
│           ├── JobList.jsx         # 작업 목록
│           └── JobDetail.jsx       # 진행률 + 로그 + 결과 미리보기
└── image_to_video_pipeline.ipynb   # 원본 Colab 프로토타입
```

## API

| 메서드 | 경로 | 설명 |
|--------|------|------|
| `GET` | `/api/jobs` | 작업 목록 |
| `POST` | `/api/jobs` | 새 작업 생성 및 파이프라인 시작 |
| `GET` | `/api/jobs/{id}` | 작업 상태 조회 |
| `DELETE` | `/api/jobs/{id}` | 작업 취소 |
| `GET` | `/api/jobs/{id}/file/{stage}` | 단계별 결과 파일 다운로드 |
| `WS` | `/ws/{id}` | 실시간 진행 상황 스트림 |

## 설정 파라미터

| 파라미터 | 기본값 | 설명 |
|----------|--------|------|
| `image_prompt` | (산악 호수) | 이미지 생성 프롬프트 |
| `image_model` | `flux` | Pollinations 모델 |
| `aspect` | `16:9` | 종횡비 |
| `base_width` | `1280` | 영상 너비 (VRAM 부족 시 832로 낮춤) |
| `device` | `cuda` | 실행 디바이스 (`cuda` / `cpu`) |
| `video_length_frames` | `49` | 프레임 수 (~3초 @ 16fps) |
| `video_steps` | `30` | 추론 스텝 (높을수록 품질↑ 속도↓) |
| `interpolate_to_fps` | `48` | RIFE 목표 FPS |
| `upscale_factor` | `2` | Real-ESRGAN 업스케일 배수 |

## 라이선스

MIT
