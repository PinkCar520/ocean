# iOS 稳定性重构记录

版本：0.1；父基线：OLO Product PRD v1.0 第 6、7、10、11、15 节。

## 已完成

- 语音服务按 UUID 隔离会话；授权返回后检查任务取消及会话有效性。
- 权限流程合并并发请求，移除任意 350ms 延迟和权限超时假结果。
- 每次录音创建独立音频桥，串行化 append/endAudio，识别错误通过 throwing stream 传递。
- 旧流结束、旧识别结果和旧超时不能关闭新会话。
- 检查本地识别支持；不支持时提示用户，不擅自转为云识别。
- 系统音频中断和服务重置终止会话；后台、离开页面及隐私切换停止输入。
- 提醒解析、EventKit 实现、任务执行与记录从 HomeView 分离至 Core/Services。
- 移除启动代码中无堆栈证据支撑的“主队列污染”解释。
- XcodeGen 覆盖 OLO、OLOWatch、OLOTests；启用 complete 并发检查及明确的非默认 MainActor 隔离。
- 工程说明修订为明确 actor 边界，避免将文件作用域或禁止捕获当作通用保证。

## 验证

2026-09-08：iOS 27 模拟器运行 4 项生命周期测试，全部通过。
场景：授权期间停止、权限拒绝、旧会话终止不影响新会话、识别错误传递。
iPhone generic device 与 watchOS generic device 构建成功；未签名、未安装到真机。
构建包含无 AppIntents 依赖的 metadata extraction 提示，未发现 Swift 编译错误。

## 后续实测与限制

2026-09-08 用户反馈“没有卡死了”。原 dispatch_assert_queue_fail 尚未取得完整符号化调用栈；此次反馈确认症状改善，不能据此证明所有中断场景均已验证。
测试使用可控权限/录音替身，不验证真实系统授权弹窗、拾音或 Speech 模型质量。
需在原设备检查首次授权、连续启停、录音中翻转隐私、来电、后台、返回重试。
当前手动停止结束流，使用最近转写片段；不是等待 Speech 最终结果的 graceful finalize。
AVAudioEngine 启动仍在生命周期拥有者 MainActor 上；需要 Instruments 测量后决定是否隔离到专用执行器。
SwiftData 原有启动与内存降级策略仍需独立审查；本次没有以未验证假设重新设计存储。
提醒解析仍是规则解析，不代表已实现通用 AI 理解；完整状态与信任模型继续受主 PRD 约束。

## 官方参考

- https://developer.apple.com/documentation/xcode/improving-app-responsiveness
- https://developer.apple.com/videos/play/wwdc2025/268/
- https://developer.apple.com/documentation/avfaudio/handling-audio-interruptions
- https://developer.apple.com/documentation/speech/sfspeechrecognizer/supportsondevicerecognition
