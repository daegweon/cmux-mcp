# cmux-mcp

[English](./README.md)

AI 에이전트에게 cmux 터미널의 완전한 제어권을 부여하는 Model Context Protocol 서버입니다.

## 개요

**cmux-mcp**는 [cmux](https://github.com/manaflow-ai/cmux)(macOS용 Ghostty 기반 터미널 앱)를 위한 Model Context Protocol 서버입니다. 이 프로젝트는 [ferrislucas/iterm-mcp](https://github.com/ferrislucas/iterm-mcp)에서 포크했지만, AppleScript 대신 cmux의 네이티브 CLI를 사용하도록 완전히 재작성되었습니다.

cmux의 `send`, `read-screen`, `send-key` 명령을 Unix 소켓 통신으로 호출하므로, cmux가 포커스되지 않은 상태에서도 백그라운드에서 동작합니다.

## 주요 특징

- **백그라운드 동작** — cmux 창의 포커스를 빼앗지 않음. Unix 소켓 통신으로 완전히 독립적 실행
- **토큰 효율성** — 전체 터미널 버퍼가 아닌 필요한 줄만 읽어 API 호출 비용 최소화
- **완전한 제어** — 명령 실행, 출력 읽기, Ctrl+C/Z/ESC 등 제어 문자 전송 가능
- **REPL 지원** — Node.js, Python, Rails 콘솔 등과 상호작용
- **스마트 완료 감지** — TTY의 CPU 활동 모니터링으로 명령 완료 시점 자동 감지
- **최소 의존성** — `@modelcontextprotocol/sdk`만 필요
- **광범위한 호환성** — Claude Desktop, Claude Code 및 모든 MCP 클라이언트 지원

## AppleScript 대신 cmux CLI를 사용하는 이유

| 기능 | AppleScript 방식 | cmux CLI 방식 |
|------|------------------|---------------|
| 백그라운드 동작 | 앱 활성화로 포커스 손실 가능 | Unix 소켓 통신, 포커스 불필요 |
| 터미널 버퍼 읽기 | Ghostty `write_scrollback_file` 액션 필요 (일부 빌드에서만 작동) | `cmux read-screen` 안정적인 프로덕션 CLI |
| 안정성 | 앱 초기화 중 AppleScript 실패 가능 | 소켓 연결 기반으로 더 탄력적 |
| 정확한 타겟팅 | 항상 최전면 창만 대상 | `--surface` 플래그로 정확한 타겟팅 지원 |
| 키 전송 | ASCII 문자 코드로 제한 | 이름 있는 키 지원: `ctrl+c`, `escape`, 화살표, `enter` 등 |

## 지원하는 MCP 도구

### 1. write_to_terminal

활성 cmux 터미널에 텍스트 또는 명령을 전송합니다.

- **입력**: `command` (문자열) — 전송할 텍스트 또는 명령
- **동작**: Enter 키를 자동으로 추가하여 명령 실행
- **반환**: 새로 출력된 라인 수 (에이전트가 읽어야 할 라인 수 결정에 사용)

```json
{
  "command": "npm run test"
}
```

### 2. read_terminal_output

활성 cmux 터미널에서 최근 N줄을 읽습니다.

- **입력**: `linesOfOutput` (정수) — 읽을 라인 수
- **동작**: 최근 N줄을 터미널 뷰포트 또는 히스토리에서 조회
- **반환**: 터미널 출력 텍스트

```json
{
  "linesOfOutput": 50
}
```

### 3. send_control_character

활성 cmux 터미널에 제어 문자를 전송합니다.

- **입력**: `letter` (문자열) — 제어 문자 (예: `C`는 Ctrl+C, `]`는 텔넷 escape)
- **동작**: 지정된 제어 문자를 터미널에 전송
- **반환**: 전송 완료 확인 메시지

```json
{
  "letter": "C"
}
```

**지원하는 제어 문자:**
- `C` — Ctrl+C (프로세스 중단)
- `Z` — Ctrl+Z (프로세스 일시 중단)
- `D` — Ctrl+D (입력 종료, EOF)
- `L` — Ctrl+L (화면 초기화)
- `]` — 텔넷 escape 시퀀스

## cmux의 알려진 이슈 해결

cmux-mcp는 다음 이슈들을 인식하고 대응합니다:

| 이슈 | 설명 | cmux-mcp 대응 |
|------|------|---------------|
| **#152** | `read-screen`이 초기에는 디버그 전용이었음 | 프로덕션 레벨로 안정화된 API 사용 |
| **#2042** | 잘못된 surface ID로 `send` 시 무음 fallback | `--surface` 플래그로 명확한 타겟팅 |
| **#1715** | 앱 시작 시 TabManager 미사용으로 훅 에러 | 소켓 기반 CLI로 초기화 타이밍 유연화 |
| **#2153** | `send-key`가 화살표 키 미지원 | 업스트림 수정된 API 활용 |
| **#2210** | 사이드바 토글 시 SIGWINCH로 프롬프트 손상 | 안정화 딜레이 후 버퍼 읽기 |

## 설치

### 요구사항

- macOS
- cmux 앱 설치 및 실행 중
- Node.js 18 이상

### Claude Code

`~/.claude/settings.json` 파일을 편집하여 MCP 서버 설정:

```json
{
  "mcpServers": {
    "cmux-mcp": {
      "command": "node",
      "args": ["/path/to/cmux-mcp/build/index.js"]
    }
  }
}
```

경로를 실제 cmux-mcp 설치 경로로 변경하세요.

### Claude Desktop

`~/Library/Application Support/Claude/claude_desktop_config.json` 파일을 편집:

```json
{
  "mcpServers": {
    "cmux-mcp": {
      "command": "node",
      "args": ["/path/to/cmux-mcp/build/index.js"]
    }
  }
}
```

설정 후 Claude Desktop을 재시작합니다.

### npm으로 설치

cmux-mcp를 npm을 통해 전역 설치할 수도 있습니다:

```bash
npm install -g cmux-mcp
```

그 다음 설정 파일에서:

```json
{
  "mcpServers": {
    "cmux-mcp": {
      "command": "cmux-mcp"
    }
  }
}
```

## 개발

### 저장소 클론 및 설치

```bash
git clone https://github.com/daegweon/cmux-mcp.git
cd cmux-mcp
npm install
```

### 빌드

TypeScript를 JavaScript로 컴파일합니다:

```bash
npm run build
```

컴파일된 파일은 `build/` 디렉토리에 생성됩니다.

### 개발 모드 (자동 재빌드)

파일 변경 시 자동으로 재빌드:

```bash
npm run watch
```

### 테스트

단위 테스트 실행:

```bash
npm test
```

테스트 감시 모드:

```bash
npm run test:watch
```

커버리지 리포트:

```bash
npm run test:coverage
```

### 디버깅

MCP Inspector를 사용하여 서버 동작을 실시간으로 확인할 수 있습니다:

```bash
npm run inspector
```

브라우저에서 제공된 URL을 열어 도구 호출을 테스트할 수 있습니다.

## 사용 예제

### 명령 실행

Claude에게 다음과 같이 요청할 수 있습니다:

> "터미널에서 `npm test`를 실행하고 결과를 알려줄래?"

Claude는 자동으로:
1. `write_to_terminal` 도구로 `npm test` 명령 전송
2. `read_terminal_output` 도구로 테스트 결과 읽기
3. 결과를 해석하고 보고

### 프로세스 중단

실행 중인 프로세스를 중단해야 할 때:

> "실행을 멈춰줄래?"

Claude는 `send_control_character` 도구로 Ctrl+C를 전송합니다.

### REPL과 상호작용

```
> "Node REPL을 시작하고 5 + 3을 계산해줄래?"

Claude가 자동으로:
1. node 명령 실행
2. 프롬프트 대기
3. "5 + 3" 입력
4. 결과 읽기
5. REPL 종료
```

## 아키텍처

### 핵심 구성요소

- **CommandExecutor** — 터미널에 명령 전송, cmux CLI 호출 관리
- **TtyOutputReader** — 터미널 버퍼 읽기, 스크롤백 히스토리 조회
- **SendControlCharacter** — 제어 문자(Ctrl+C 등) 전송
- **ProcessTracker** — TTY의 활성 프로세스 추적, 리소스 사용량 모니터링

### 통신 흐름

```
Claude/MCP Client
       ↓
   MCP Server (stdio)
       ↓
   Tool Handler (write_to_terminal, read_terminal_output, send_control_character)
       ↓
   cmux CLI (Unix 소켓)
       ↓
   cmux.app (Ghostty)
       ↓
   macOS TTY 커널
```

## 안전 고려사항

- **사용자 책임**: MCP 서버를 안전하게 사용할 책임은 사용자에게 있습니다
- **제한 없음**: cmux-mcp는 실행되는 명령의 안전성을 평가하지 않습니다
- **모니터링**: AI 모델의 동작이 예상치 못하게 진행될 수 있으니, 항상 모니터링하고 필요시 중단하세요
- **점진적 시작**: 작고 집중된 작업부터 시작하여 모델의 동작을 파악한 후 복잡한 작업에 진행하세요

## 크레딧

- [ferrislucas/iterm-mcp](https://github.com/ferrislucas/iterm-mcp) — 원본 아이디어 및 기본 구조
- [cmux](https://github.com/manaflow-ai/cmux) — Ghostty 기반 터미널 멀티플렉서

## 라이선스

MIT

## 피드백 및 이슈

문제가 발생하거나 기능을 제안하고 싶다면 [GitHub Issues](https://github.com/daegweon/cmux-mcp/issues)에서 보고해주세요.
