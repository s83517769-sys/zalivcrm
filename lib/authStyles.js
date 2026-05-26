export const authStyles = `
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&family=Inter:wght@300;400;500;600&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body.dark{--bg:#08090d;--s1:#0e0f15;--s2:#13141c;--s3:#191b25;--bd:#252840;--bd2:#2f3355;--t:#dde1f0;--t2:#8892b0;--t3:#4a5275;--acc:#5b6ef5;--acc2:#4556e0}
body.light{--bg:#f0f2f5;--s1:#ffffff;--s2:#f8f9fb;--s3:#eef0f4;--bd:#dde1eb;--bd2:#c5cad8;--t:#1a1d2e;--t2:#4a5275;--t3:#8892b0;--acc:#4556e0;--acc2:#3445d0}
body{background:var(--bg);color:var(--t);font-family:'Inter',sans-serif;font-size:13px}
.auth-wrap{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
.auth-card{width:100%;max-width:360px;background:var(--s1);border:1px solid var(--bd);border-radius:12px;padding:28px}
.auth-logo{font-family:'JetBrains Mono',monospace;font-size:20px;font-weight:500;letter-spacing:.04em;text-align:center}
.auth-logo em{color:var(--acc);font-style:normal}
.auth-sub{text-align:center;color:var(--t3);font-size:12px;margin:4px 0 22px}
.auth-fi{display:flex;flex-direction:column;gap:4px;margin-bottom:14px}
.auth-fi label{font-size:10px;color:var(--t3);text-transform:uppercase;letter-spacing:.05em}
.auth-fi input{background:var(--s2);border:1px solid var(--bd);border-radius:6px;padding:9px 11px;color:var(--t);font-size:13px;font-family:'Inter',sans-serif;outline:none}
.auth-fi input:focus{border-color:var(--acc)}
.auth-err{background:rgba(240,85,85,.1);border:1px solid rgba(240,85,85,.3);color:#f05555;font-size:12px;border-radius:6px;padding:8px 11px;margin-bottom:12px}
.auth-ok{background:rgba(34,209,122,.1);border:1px solid rgba(34,209,122,.3);color:#22d17a;font-size:12px;border-radius:6px;padding:8px 11px;margin-bottom:12px}
.auth-btn{width:100%;background:var(--acc2);border:1px solid var(--acc);border-radius:6px;padding:10px;color:#fff;font-size:14px;font-weight:500;cursor:pointer;font-family:'Inter',sans-serif;transition:background .1s}
.auth-btn:hover{background:var(--acc)}
.auth-btn:disabled{opacity:.6;cursor:default}
.auth-link{text-align:center;font-size:12px;color:var(--t3);margin-top:16px}
.auth-link a{color:var(--acc);text-decoration:none}
.auth-link a:hover{text-decoration:underline}
.auth-divider{display:flex;align-items:center;gap:10px;color:var(--t3);font-size:11px;margin:16px 0}
.auth-divider::before,.auth-divider::after{content:'';flex:1;height:1px;background:var(--bd)}
.auth-btn-gh{width:100%;display:flex;align-items:center;justify-content:center;gap:8px;background:var(--s3);border:1px solid var(--bd2);border-radius:6px;padding:10px;color:var(--t);font-size:14px;font-weight:500;cursor:pointer;font-family:'Inter',sans-serif;transition:background .1s}
.auth-btn-gh:hover{background:var(--s2)}
.auth-btn-gh:disabled{opacity:.6;cursor:default}
.auth-btn-gh svg{flex-shrink:0}
.onb-step{display:flex;gap:12px;align-items:flex-start;padding:12px 0;border-bottom:1px solid var(--bd)}
.onb-step:last-child{border-bottom:none}
.onb-num{width:26px;height:26px;border-radius:50%;background:rgba(91,110,245,.15);color:var(--acc);display:flex;align-items:center;justify-content:center;font-weight:600;font-size:13px;flex-shrink:0;font-family:'JetBrains Mono',monospace}
.onb-tt{font-size:13px;color:var(--t);font-weight:500;margin-bottom:3px}
.onb-ds{font-size:12px;color:var(--t3);line-height:1.5}
.onb-ds a{color:var(--acc);text-decoration:none}
`
