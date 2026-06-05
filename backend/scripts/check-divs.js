const fs = require('fs');
const c = fs.readFileSync('../apps/admin/src/modules/monitor/pages/MonitorPage.tsx', 'utf8');
const opens = (c.match(/<div/g) || []).length;
const closes = (c.match(/<\/div>/g) || []).length;
console.log('open divs:', opens, 'close divs:', closes);
if (opens !== closes) console.log('MISMATCH! Difference:', opens - closes);
else console.log('OK - balanced');
