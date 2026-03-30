# cmux-mcp

[English](./README.md)

**AI 에이전트가 [cmux](https://github.com/manaflow-ai/cmux) 터미널을 직접 제어할 수 있게 해주는 MCP 서버입니다.**

Claude가 cmux 터미널에서 명령을 실행하고, 출력을 읽고, 제어 문자를 보낼 수 있습니다. 백그라운드에서 동작하며 포커스를 뺏지 않습니다.

## 빠른 시작

### 1. 클론 및 빌드

```bash
git clone https://github.com/daegweon/cmux-mcp.git
cd cmux-mcp
npm install && npm run build
```

### 2. Claude Code에 등록

`~/.claude/settings.json`을 편집합니다:

```jsonc
{
  "mcpServers": {
    "cmux-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/cmux-mcp/build/index.js"]
    }
  }
}
```

### 3. Claude Code 재시작

끝입니다. 이제 Claude가 cmux 터미널을 읽고 쓸 수 있습니다.

<details>
<summary>Claude Desktop 설정</summary>

`~/Library/Application Support/Claude/claude_desktop_config.json`을 편집합니다:

```jsonc
{
  "mcpServers": {
    "cmux-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/cmux-mcp/build/index.js"]
    }
  }
}
```

저장 후 Claude Desktop을 재시작합니다.

</details>

<details>
<summary>기타 MCP 클라이언트</summary>

cmux-mcp는 stdio로 통신합니다. MCP 클라이언트에서 `node /path/to/cmux-mcp/build/index.js`를 지정하면 됩니다.

</details>

### 요구사항

- macOS
- [cmux.app](https://github.com/manaflow-ai/cmux) 설치 및 실행
- Node.js 18+

## 무엇을 할 수 있나요?

cmux-mcp는 MCP 클라이언트에 세 가지 도구를 제공합니다:

### `write_to_terminal`

터미널에 명령을 전송합니다. Enter가 자동으로 추가됩니다. 새로 출력된 라인 수를 반환해서 에이전트가 얼마나 읽어야 하는지 알 수 있습니다.

```
"터미널에서 npm test 실행해줘"
```

### `read_terminal_output`

터미널의 최근 N줄을 읽습니다. 요청한 만큼만 가져오므로 전체 스크롤백에 토큰을 낭비하지 않습니다.

```
"터미널 출력 마지막 20줄 보여줘"
```

### `send_control_character`

Ctrl+C, Ctrl+Z, Escape 등 제어 문자를 전송합니다. 멈춘 프로세스 중단, REPL 종료, 텔넷 escape 시퀀스 전송에 사용합니다.

```
"실행 중인 프로세스 중단해줘" → Ctrl+C 전송
```

**지원하는 제어 문자:**

| 입력 | 동작 |
|------|------|
| `C` | Ctrl+C (프로세스 중단) |
| `Z` | Ctrl+Z (프로세스 일시 중단) |
| `D` | Ctrl+D (EOF, 입력 종료) |
| `L` | Ctrl+L (화면 초기화) |
| `ESC` | Escape 키 |
| `]` | 텔넷 escape 시퀀스 |

### 실제 사용 예시

**테스트 실행 후 실패 분석:**
> "테스트 실행하고 실패한 테스트가 뭔지 알려줘"

Claude가 `npm test`를 보내고, 출력을 읽어서, 실패 항목을 요약해줍니다.

**REPL 대화형 세션:**
> "Python REPL 열고 pandas 설치됐는지 확인해줘"

Claude가 `python3`을 실행하고, `import pandas`를 입력하고, 결과를 읽어서 알려줍니다.

**장시간 프로세스 관리:**
> "개발 서버 시작하고, 준비되면 헬스 체크 실행해줘"

Claude가 서버 시작 명령을 보내고, "ready"가 출력될 때까지 폴링한 후, 다음 명령을 실행합니다.

## 왜 cmux-mcp인가?

### 백그라운드 동작

cmux-mcp는 cmux의 네이티브 CLI(`cmux send`, `cmux read-screen`, `cmux send-key`)를 사용합니다. Unix 소켓으로 통신하므로:

- cmux가 백그라운드에 있어도 동작
- 창 포커스를 뺏지 않음
- AppleScript 활성화 지연 없음
- 앱 초기화 중에도 안정적

### CLI vs AppleScript

이 프로젝트는 [ferrislucas/iterm-mcp](https://github.com/ferrislucas/iterm-mcp)에서 포크한 뒤 완전히 재작성했습니다:

| | AppleScript (iterm-mcp) | cmux CLI (cmux-mcp) |
|---|---|---|
| **포커스** | 앱 활성화로 포커스 손실 | 포커스 변경 없음, Unix 소켓 |
| **버퍼 읽기** | Ghostty `write_scrollback_file` (디버그 전용) | `cmux read-screen` (안정적 프로덕션 API) |
| **앱 시작** | 초기화 미완료 시 실패 | 소켓 기반으로 더 탄력적 |
| **타겟팅** | 항상 "최전면 창" | `--surface` 플래그로 정확한 패널 지정 |
| **키 지원** | ASCII 코드만 | 이름 있는 키: `ctrl+c`, `escape`, `enter`, 화살표 |
| **안정성** | 앱 상태 변경에 취약 | 소켓 IPC로 분리 |

### 스마트 완료 감지

명령을 보낸 후 무작정 기다리지 않습니다. TTY의 CPU 활동을 모니터링해서 명령이 실제로 완료된 시점을 감지합니다. 시간에 걸쳐 출력이 나오는 명령도 정확하게 처리합니다.

### 토큰 효율성

에이전트는 필요한 줄만 읽습니다. `npm test`가 500줄을 출력했다면? 에이전트는 먼저 "500줄이 출력됨"이라는 정보를 받고, 에러 확인을 위해 마지막 20줄만 읽습니다. 컨텍스트 윈도우를 낭비하지 않습니다.

## cmux 알려진 이슈 대응

cmux-mcp의 아키텍처는 cmux의 여러 알려진 엣지 케이스를 회피합니다:

| 이슈 | 문제 | cmux-mcp 대응 |
|------|------|---------------|
| [#152](https://github.com/manaflow-ai/cmux/issues/152) | `read-screen`이 디버그 전용이었음 | 현재 안정화된 프로덕션 CLI 사용 |
| [#2042](https://github.com/manaflow-ai/cmux/issues/2042) | 잘못된 surface ID로 포커스된 패널에 무음 fallback | `--surface`로 명시적 타겟팅 지원 |
| [#1715](https://github.com/manaflow-ai/cmux/issues/1715) | 앱 시작 시 TabManager 미준비로 훅 에러 | 소켓 기반 CLI로 초기화 타이밍 회피 |
| [#2153](https://github.com/manaflow-ai/cmux/issues/2153) | `send-key`가 화살표 키 미지원 | 업스트림 수정된 API 활용 |
| [#2210](https://github.com/manaflow-ai/cmux/issues/2210) | 사이드바 토글로 SIGWINCH 프롬프트 손상 | 안정화 딜레이 후 버퍼 읽기 |

## 아키텍처

```
MCP 클라이언트 (Claude Code, Claude Desktop 등)
    |  stdio
cmux-mcp 서버
    |  child_process
cmux CLI (send / read-screen / send-key)
    |  Unix 소켓
cmux.app (Ghostty 기반 터미널)
    |
macOS PTY
```

**핵심 모듈:**

| 모듈 | 역할 |
|------|------|
| `CommandExecutor` | `cmux send`로 명령 전송, 완료 대기 |
| `TtyOutputReader` | `cmux read-screen`으로 터미널 버퍼 읽기 |
| `SendControlCharacter` | `cmux send-key`로 제어 키 전송 |
| `ProcessTracker` | TTY 프로세스 모니터링, 완료 감지 |

## 개발

```bash
npm run build          # TypeScript 컴파일
npm run watch          # 변경 시 자동 재빌드
npm test               # 단위 테스트 실행
npm run e2e            # E2E 테스트 (cmux 실행 필요)
npm run inspector      # MCP Inspector로 대화형 디버깅
```

## 안전 고려사항

- 명령 실행에 대한 제한이 없습니다. 쉘 권한으로 실행됩니다.
- AI 동작을 모니터링하고 필요시 중단하세요.
- 익숙해질 때까지 작고 집중된 작업부터 시작하세요.

## 크레딧

- [ferrislucas/iterm-mcp](https://github.com/ferrislucas/iterm-mcp)에서 포크
- [cmux](https://github.com/manaflow-ai/cmux)를 위해 제작

## 라이선스

MIT
