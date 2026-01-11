# Agentic Design Patterns Guide

This document contains the 21 agentic design patterns that PACO Builder uses to architect AI agents. Each pattern addresses specific challenges in agent design.

---

## Part 1: Workflow Patterns

### 1. Prompt Chaining (Pipeline Pattern)

**Problem:** Complex tasks overwhelm LLMs when handled in a single prompt.

**Solution:** Break down complex problems into a sequence of smaller, focused prompts where the output of one feeds as input to the next.

**When to Use:**
- Task has multiple distinct processing stages
- Each stage requires focused attention
- You need validation between steps
- Debugging requires visibility into intermediate results

**Implementation:**
```
[Input] → [Prompt 1] → [Output 1] → [Prompt 2] → [Output 2] → [Final]
```

**Best Practices:**
- Use structured output (JSON/XML) between steps
- Each prompt should have ONE clear objective
- Validate outputs before passing to next step
- Consider using different models for different steps

---

### 2. Routing Pattern

**Problem:** A single workflow cannot handle diverse inputs efficiently.

**Solution:** Classify input intent first, then route to specialized handlers.

**Routing Approaches:**
1. LLM-based: Prompt model to classify
2. Embedding-based: Semantic similarity
3. Rule-based: Keyword/pattern matching
4. Classifier: Trained routing model

---

### 3. Parallelization Pattern

**Problem:** Sequential execution is slow when tasks are independent.

**Solution:** Execute independent tasks concurrently, then aggregate results.

**Types:**
1. Fan-out/Fan-in: Single input spawns multiple tasks, results merged
2. Map-Reduce: Apply same operation to multiple items
3. Ensemble: Multiple agents solve same problem

---

### 4. Planning Pattern

**Problem:** Complex goals require strategic decomposition.

**Solution:** Have the agent create a multi-step plan before execution.

**Planning Approaches:**
1. Upfront Planning: Generate complete plan, then execute
2. Iterative Planning: Plan, execute, replan
3. Hierarchical Planning: High-level decomposed into sub-plans

---

### 5. Goal Setting & Monitoring Pattern

**Problem:** Agents can lose track of objectives during complex tasks.

**Solution:** Explicitly define objectives, track progress, evaluate completion.

---

## Part 2: Optimization Patterns

### 6. Reflection Pattern (Self-Correction)

**Problem:** Single-pass generation often produces suboptimal outputs.

**Solution:** Create a feedback loop where output is critiqued and refined.

**Approaches:**
1. Self-Reflection: Same model critiques its output
2. Producer-Critic: Separate model provides critique
3. Rubric-Based: Evaluate against specific criteria

---

### 7. Memory Management Pattern

**Problem:** Agents lose context between sessions.

**Solution:** Implement persistent storage across sessions.

**Memory Types:**
1. Short-term: Current conversation context
2. Working Memory: Scratchpad for current task
3. Long-term: Persistent knowledge base
4. Episodic: Summaries of past interactions

---

### 8. Resource Optimization Pattern

**Problem:** Unlimited agent autonomy leads to excessive costs.

**Solution:** Implement constraints on compute, time, and cost.

**Strategies:**
1. Model Selection: haiku/sonnet/opus based on task
2. Caching: Cache common responses
3. Batching: Group operations (50% savings)
4. Early Termination: Stop when goal achieved
5. Token Budgets: Set limits

---

### 9. Prioritization Pattern

**Problem:** Multiple tasks compete for attention.

**Solution:** Order tasks by importance, urgency, and dependencies.

---

### 10. Reasoning Techniques Pattern

**Problem:** Complex problems require structured thinking.

**Solution:** Apply structured reasoning techniques.

**Chain-of-Thought (CoT):**
- Basic: "Think step-by-step"
- Guided: Specify steps to follow
- Structured: Use XML tags for separation

```xml
<thinking>
- Analyze the problem
- Identify constraints
- Consider approaches
</thinking>
<answer>
Final response
</answer>
```

---

## Part 3: Safety Patterns

### 11. Guardrails/Safety Pattern

**Problem:** Unconstrained agents can produce harmful outputs.

**Solution:** Implement constraints on inputs and outputs.

**Guardrail Types:**
1. Input Guardrails: Validate user input
2. Output Guardrails: Check generated content
3. Tool Guardrails: Restrict tool operations
4. Flow Guardrails: Require approval for sensitive paths

**Actions:** Block, Warn, Escalate, Transform

---

### 12. Human-in-the-Loop (HITL) Pattern

**Problem:** Some decisions are too critical for autonomous operation.

**Solution:** Build escalation paths that pause for human approval.

**When to Escalate:**
1. Confidence threshold not met
2. Certain action types (delete, send, publish)
3. Value threshold exceeded
4. User preference

---

### 13. Exception Handling & Recovery Pattern

**Problem:** Errors are inevitable.

**Solution:** Implement structured error handling and recovery.

**Strategies:**
1. Retry with backoff
2. Fallback to alternative
3. Escalate to human
4. Graceful degradation
5. Abort with clear message

---

### 14. Evaluation & Monitoring Pattern

**Problem:** Without measurement, you can't improve.

**Solution:** Implement testing and runtime monitoring.

**Metrics:**
- Response quality
- Latency
- Cost
- Error rates
- User satisfaction

---

## Part 4: Collaboration Patterns

### 15. Multi-Agent Pattern

**Problem:** Complex tasks require diverse expertise.

**Solution:** Orchestrate multiple specialized agents.

**Architectures:**
1. Coordinator: Central agent delegates to specialists
2. Pipeline: Agents process in sequence
3. Ensemble: Multiple agents, best answer selected
4. Debate: Agents argue to consensus

---

### 16. Tool Use (Function Calling) Pattern

**Problem:** LLMs are limited to training data.

**Solution:** Enable agents to call external tools.

**Tool Types:**
1. Information Retrieval
2. Computation
3. Actions
4. Integration

---

### 17. Inter-Agent Communication (A2A) Pattern

**Problem:** Isolated agents cannot leverage each other.

**Solution:** Establish protocols for agent communication.

**Communication Types:**
1. Request/Response
2. Broadcast
3. Subscription
4. Delegation

---

### 18. MCP (Model Context Protocol) Integration Pattern

**Problem:** Each tool integration requires custom code.

**Solution:** Use MCP for standardized tool integration.

**Benefits:**
- Standardized definitions
- Discoverable capabilities
- Cross-platform compatibility

---

## Part 5: Learning Patterns

### 19. RAG (Retrieval-Augmented Generation) Pattern

**Problem:** LLMs have knowledge cutoffs.

**Solution:** Retrieve relevant information and include in context.

**RAG Pipeline:**
```
[Query] → [Embed] → [Search] → [Retrieve] → [Augment] → [Generate]
```

---

### 20. Learning & Adaptation Pattern

**Problem:** Static agents cannot improve.

**Solution:** Implement mechanisms to learn from feedback.

**Approaches:**
1. Feedback Integration
2. Self-Improvement
3. Example Learning
4. Prompt Tuning

---

### 21. Exploration & Discovery Pattern

**Problem:** Agents may get stuck in local optima.

**Solution:** Balance exploitation with exploration.

**Strategies:**
1. Random Variation
2. Curiosity-Driven
3. Diverse Sampling
4. External Input

---

## Pattern Selection Guide

| Scenario | Recommended Patterns |
|----------|---------------------|
| Complex multi-step task | Prompt Chaining, Planning |
| Multiple request types | Routing, Multi-Agent |
| Need for speed | Parallelization, Resource Optimization |
| High-stakes output | Reflection, HITL, Guardrails |
| External integrations | Tool Use, MCP Integration |
| Conversational continuity | Memory Management |
| Knowledge-intensive | RAG |
| Quality critical | Reflection, Evaluation |
| Cost sensitive | Resource Optimization |

---

## References

1. "Agentic Design Patterns" - Antonio Gulli
2. Anthropic Claude Documentation - https://platform.claude.com/docs
3. Chain-of-Thought Prompting - Claude Platform Docs
4. Memory Tool - Claude Platform Docs
5. Agent SDK - Claude Platform Docs
