-- 旧轨审批（ApprovalRequest）退役：审批统一走 RunApproval（外部审批端点 /api/approvals）。
DROP TABLE IF EXISTS "approval_requests";
