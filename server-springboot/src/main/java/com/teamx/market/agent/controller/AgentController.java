package com.teamx.market.agent.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.teamx.market.auth.JwtUtil;
import com.teamx.market.auth.UserContext;
import com.teamx.market.auth.dto.AgentChatReq;
import com.teamx.market.auth.entity.AgentChatLog;
import com.teamx.market.auth.mapper.AgentChatLogMapper;
import com.teamx.market.common.R;
import com.teamx.market.config.MarketProperties;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.client.RestTemplate;

import java.time.Duration;
import java.util.HashMap;
import java.util.Map;

/**
 * Agent 对话薄代理（架构裁定）：POST /api/v1/agent/chat
 * 真入口是 FastAPI :8100；本端携带用户上下文转发并留痕 agent_chat_log
 */
@Slf4j
@RestController
@RequestMapping("/api/v1/agent")
@RequiredArgsConstructor
public class AgentController {

    private final MarketProperties properties;
    private final JwtUtil jwtUtil;
    private final AgentChatLogMapper chatLogMapper;
    private final RestTemplate restTemplate = new RestTemplate();

    @PostMapping("/chat")
    public R<Map<String, Object>> chat(@Valid @RequestBody AgentChatReq req) {
        long uid = UserContext.uid();

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.set("X-User-Id", String.valueOf(uid));
        headers.set(HttpHeaders.AUTHORIZATION, "Bearer " + jwtUtil.generate(0, JwtUtil.ROLE_AGENT_SVC));

        Map<String, Object> body = new HashMap<>();
        body.put("prompt", req.getPrompt());
        body.put("requestId", req.getRequestId());
        body.put("userId", uid);

        R<Map<String, Object>> result;
        try {
            HttpEntity<Map<String, Object>> entity = new HttpEntity<>(body, headers);
            @SuppressWarnings({"unchecked", "rawtypes"})
            org.springframework.http.ResponseEntity<Map> resp = restTemplate.postForEntity(
                    properties.getAgent().getBaseUrl() + "/api/v1/agent/chat", entity, Map.class);
            Map<String, Object> remote = resp.getBody();
            result = new R<>();
            result.setCode(remote == null || remote.get("code") == null ? 5000
                    : ((Number) remote.get("code")).intValue());
            result.setMsg(remote == null || remote.get("msg") == null ? "agent 服务无响应"
                    : String.valueOf(remote.get("msg")));
            @SuppressWarnings("unchecked")
            Map<String, Object> data = (Map<String, Object>) (remote == null ? null : remote.get("data"));
            result.setData(data);
        } catch (Exception e) {
            log.warn("agent chat forward failed: {}", e.getMessage());
            result = R.fail(5000, "Agent 服务不可用，请稍后再试");
        }

        // 留痕 agent_chat_log：OK / DENIED(4003) / ERROR
        AgentChatLog logRow = new AgentChatLog();
        logRow.setUserId(uid);
        logRow.setPrompt(req.getPrompt());
        logRow.setResponse(truncate(result.getMsg(), 2000));
        Object data = result.getData();
        if (data instanceof Map<?, ?> d && d.get("skillName") != null) {
            logRow.setSkillName(String.valueOf(d.get("skillName")));
            Object reply = d.get("reply");
            if (reply != null) {
                logRow.setResponse(truncate(String.valueOf(reply), 2000));
            }
        }
        logRow.setStatus(result.getCode() == 0 ? AgentChatLog.STATUS_OK
                : result.getCode() == 4003 ? AgentChatLog.STATUS_DENIED : AgentChatLog.STATUS_ERROR);
        chatLogMapper.insert(logRow);

        R<Map<String, Object>> out = new R<>();
        out.setCode(result.getCode());
        out.setMsg(result.getMsg());
        out.setData(result.getData());
        return out;
    }

    private String truncate(String s, int max) {
        if (s == null) {
            return null;
        }
        return s.length() <= max ? s : s.substring(0, max);
    }
}
