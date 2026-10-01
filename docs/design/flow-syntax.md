# 흐름 문법

| 항목 | 값 |
|---|---|
| 상태 | 구현 |
| 관련 결정 | 없음 |

## 요약

흐름 문법은 D2 원본 안에 `#@`로 시작하는 줄로 애니메이션 순서를 적는 문법이다. 단계, 박자, 이동, 카드 내용, 설명을 적고, D2 도형과 선은 D2 id로 가리킨다.

## 동기

D2로 구조를 그리는 사람은 요청이 어느 순서로 어디를 지나는지까지 보여 주고 싶다. D2의 애니메이션은 보드 넘기기와 점선 흐르기뿐이라 한 요청의 경로를 따라가기 어렵다. 별도 JSON에 흐름을 적으면 그림과 흐름이 두 파일로 나뉘어 이름이 어긋난다. 흐름 문법은 흐름을 같은 파일에 두고, D2에게는 주석이라 원본을 `d2` 명령으로도 그대로 그린다.

## 예시

### 요청 하나를 따라가기

```d2
direction: right
agent: Your AI Agent
api: Hindsight API {
  retain: "Retain\nLLM extraction"
}
facts: "Facts\nworld · experience" {shape: cylinder}
agent -> api.retain: retain()
api.retain -> facts

#@ step "retain()": 에이전트가 대화를 보낸다
#@   agent -> retain "the conversation"
#@   show agent [user/gray] “Alice joined Google in March.”
#@   retain -> facts +3s : LLM이 사실을 뽑는다
#@   show facts [world] Alice joined Google · Mar 2026 (new)
#@   retain -> agent "✓ stored"
```

1. 사용자는 `retain()` 탭과 설명 `에이전트가 대화를 보낸다`를 본다.
2. 점이 `agent`에서 `retain`으로 `the conversation` 글 상자를 싣고 간다.
3. `agent` 카드에 `USER` 태그가 붙은 줄이 나타난다.
4. 점이 3초 동안 `facts`로 가고, 설명이 `LLM이 사실을 뽑는다`로 바뀐다.
5. 마지막 점은 선을 거꾸로 따라 `agent`로 돌아간다.

## 상세 설계

### 줄 종류

| 줄 | 뜻 |
|---|---|
| `#@ speed 900` | 점이 선 하나를 지나는 기본 시간. `900`, `900ms`, `2s` 형식. 없으면 토큰 `duration.hop` |
| `#@ edges d2` | 선 모양. `d2`는 다듬은 D2 경로, `curve`는 D2 경로의 두 끝을 잇는 곡선 |
| `#@ quiet a -> b & c -> d` | 조용한 선. 적은 선은 쓰는 단계에서만 보인다. `#@ quiet`만 적으면 모든 선이다 |
| `#@ step "이름": 설명` | 단계 하나. 탭 이름과 기본 설명 |
| `#@ a -> b` | 이동 하나. a에서 b로 가는 점 |
| `#@ a -> b "글"` | 점에 붙이는 글 상자 |
| `#@ a -> b & c -> d` | 한 박자 안의 여러 이동 |
| `#@ a -> b : 설명` | 이 박자부터 보일 설명 |
| `#@ a -> b +3s` | 이 박자만의 이동 시간 |
| `#@ a -> b[1]` | 같은 두 도형 사이의 두 번째 선 |
| `#@ show a [태그/색] 글 · 덧붙임 (표시)` | 바로 앞 박자에 더하는 도형 a의 카드 줄 하나 |
| `#@ light a b : 설명` | 점 없이 도형만 밝히는 박자 |
| `#@ say 설명` | 점 없이 설명만 바꾸는 박자 |
| `#@ wait 500ms : 설명` | 멈추는 박자. 뒤에 `show`를 붙이면 카드만 바꾸는 박자 |

- 첫 `step` 앞의 박자 줄은 오류다.
- `show`의 대상 박자는 바로 앞 박자다. 단계의 첫 줄이 `show`이면 멈추는 박자를 하나 만든다.
- 같은 박자에 같은 도형의 `show`가 여럿이면 줄을 이어 붙인다.
- 따옴표 안의 `:`와 `&`는 글자로 읽는다.

### 이름 찾기

1. `cli`는 이름을 D2 id와 먼저 그대로 비교한다.
2. 같은 id가 없으면 끝부분이 `.{이름}`인 id가 하나일 때 그 id를 쓴다.
3. 끝부분이 맞는 id가 여럿이면 후보를 보이며 오류를 낸다.
4. `sql_table`, `class`의 칸 이름은 그 표의 id로 찾는다. D2가 칸에 잇는 선을 표에 잇는 선으로 만들기 때문이다.

### 이동 방향

- 이동 `a -> b`는 a와 b 사이의 선을 찾는다. 선의 방향은 따지지 않는다.
- 선이 `b -> a`로 그려져 있으면 점은 선을 거꾸로 따라간다.
- 두 도형 사이에 선이 없으면 오류를 낸다.

### 카드 줄

| 부분 | 형식 | 그리는 모양 |
|---|---|---|
| 태그 | 줄 앞 `[world]`, 색 지정은 `[world/green]`. 색은 `blue`, `purple`, `green`, `orange`, `gray` | 대문자로 바꾼 색 알약. 색이 없으면 태그마다 파랑, 보라, 초록, 주황 순서 |
| 덧붙임 | ` · ` 뒤 글 | 흐린 글 |
| 표시 | 줄 끝 `(new)`, `(✓)` 같은 8자 이하. 9자 이상이면 글의 일부 | 오른쪽 파란 글 |
| 고정폭 | 글 전체를 `` ` ``로 감쌈. 안의 ` · `도 글의 일부 | 고정폭 글꼴 |
| 관계 그래프 | `graph 가 -> 나, 가 -> 다 ; 가`. `,`로 관계를 나누고 `;` 뒤는 밝힐 이름 | 이름 알약을 깊이별 열로 놓은 작은 그래프. 밝힌 이름은 파란 알약 |

### 오류

- 모든 오류는 `{줄 번호}번째 줄: {이유}` 형식이다.
- 줄 번호는 원본 `.d2` 파일의 줄 번호다.

### 요구사항

| 요구사항 | 검증 계획 |
|---|---|
| `#@` 줄만 흐름으로 읽고 D2 줄은 건너뛴다. | `test/flow.test.js`의 `parseFlow_d2_lines_reads_only_directives` |
| `say`, `wait`, `light`, `[n]` 선택을 읽는다. | `test/flow.test.js`의 `parseFlow_pause_lines_read_say_wait_light`, `parseFlow_indexed_hop_reads_edge_index_and_quoted_colon` |
| 카드 줄, 박자 시간, 선 모양 줄을 읽는다. | `test/flow.test.js`의 `parseRow_full_row_reads_tag_tone_meta_mark`, `parseFlow_plus_time_sets_beat_ms`, `parseFlow_edges_directive_sets_edge_mode` |
| 잘못된 줄은 줄 번호와 함께 알린다. | `test/flow.test.js`의 `parseFlow_beat_before_step_throws_with_line`, `parseFlow_unclosed_quote_throws` |
| 끝 이름, 거꾸로 가는 이동, 몇 번째 선을 D2 선에 잇는다. | `test/build.test.js`의 `build_reverse_hop_in_container_runs_edge_backward`, `build_indexed_hop_picks_second_edge` |
| 없는 선과 모호한 이름을 줄 번호와 함께 알린다. | `test/build.test.js`의 `build_missing_edge_throws_with_line`, `build_ambiguous_name_throws` |
| 조용한 선을 모든 선이나 적은 선으로 읽는다. | `test/flow.test.js`의 `parseFlow_quiet_reads_all_or_listed_hops` |
| 관계 그래프 줄을 이름, 관계, 밝힐 이름으로 읽고, 이름이 빠지면 줄 번호와 함께 알린다. | `test/flow.test.js`의 `parseRow_graph_reads_nodes_edges_and_lit`, `parseFlow_graph_missing_name_throws_with_line` |
| 글 전체를 `` ` ``로 감싼 카드 줄은 안의 ` · `까지 한 고정폭 글로 읽는다. | `test/flow.test.js`의 `parseRow_backquoted_text_with_dot_is_one_mono_text` |
| 흐름 줄이 있는 원본을 `d2` 명령으로 그린다. | `test/build.test.js`의 `d2_cli_source_with_directives_compiles` |

## 단점

- 흐름 줄은 D2 편집기에서 주석으로 보여 문법 강조와 자동 완성이 없다.
- 도형 이름을 끝부분으로 줄여 쓰면, 나중에 같은 이름의 도형이 생길 때 오류가 난다.

## 대안

- 별도 JSON 파일에 흐름 적기: 그림과 흐름의 이름이 두 파일에서 어긋나 버렸다.
- D2 `vars`에 흐름 적기: 중첩 괄호가 깊어져 흐름을 읽기 어려워 버렸다.
