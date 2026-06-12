const fs = require('fs');
const code = fs.readFileSync('src/features/dashboard/DashboardApp.tsx', 'utf8');
const openRegex = /<section\b[^>]*>/g;
const closeRegex = /<\/section>/g;
let match;
const opens = [];
const closes = [];
while ((match = openRegex.exec(code)) !== null) {
  opens.push({ index: match.index, line: code.slice(0, match.index).split(/\r?\n/).length, text: match[0] });
}
while ((match = closeRegex.exec(code)) !== null) {
  closes.push({ index: match.index, line: code.slice(0, match.index).split(/\r?\n/).length });
}
console.log('opens', opens.length, 'closes', closes.length);
const combined = [];
opens.forEach((o) => combined.push({ idx: o.index, type: 'open', line: o.line, text: o.text }));
closes.forEach((c) => combined.push({ idx: c.index, type: 'close', line: c.line }));
combined.sort((a, b) => a.idx - b.idx);
const stack = [];
for (const item of combined) {
  if (item.type === 'open') {
    stack.push(item);
  } else {
    if (stack.length === 0) {
      console.log('extra close at', item.line);
    } else {
      stack.pop();
    }
  }
}
if (stack.length > 0) {
  console.log('unmatched opens:');
  stack.forEach((o) => console.log(o.line, o.text));
} else {
  console.log('all matched');
}
