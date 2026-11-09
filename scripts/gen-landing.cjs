const fs=require('fs'),path=require('path');
const OUT=path.join(__dirname,'..','public');
const DEPLOY=path.join(__dirname,'..','deploy');
const css=require('./landing-css.cjs');

const js=`
document.documentElement.classList.add('js-ready');
const apkLink=document.querySelector('[data-apk-download]');
if(apkLink)fetch(apkLink.href,{method:'HEAD'}).then(response=>{
  const contentType=response.headers.get('content-type')?.split(';')[0];
  if(response.ok&&['application/vnd.android.package-archive','application/octet-stream'].includes(contentType))apkLink.hidden=false;
}).catch(()=>{});
// Theme toggle (icon follows data-theme via CSS)
document.getElementById('themeToggle').addEventListener('click',()=>{
  const next=document.documentElement.getAttribute('data-theme')==='dark'?'light':'dark';
  document.documentElement.setAttribute('data-theme',next);
  try{localStorage.setItem('theme',next)}catch(e){}
});
// Reveal on scroll
const io=new IntersectionObserver(e=>{e.forEach(x=>{if(x.isIntersecting){x.target.classList.add('v');io.unobserve(x.target)}})},{threshold:.08,rootMargin:'0px 0px -30px 0px'});
document.querySelectorAll('.rv').forEach(e=>io.observe(e));
// Nav scroll effect
const nav=document.getElementById('mn');
window.addEventListener('scroll',()=>{nav.classList.toggle('sc',window.scrollY>20)},{passive:true});
// Nav section highlighting
const secs=document.querySelectorAll('section[id]');
const navLinks=document.querySelectorAll('.nl a[data-sec]');
const secObs=new IntersectionObserver(entries=>{
  entries.forEach(en=>{
    if(en.isIntersecting){
      navLinks.forEach(l=>l.classList.remove('on'));
      const link=document.querySelector('.nl a[data-sec="'+en.target.id+'"]');
      if(link)link.classList.add('on');
    }
  });
},{threshold:.3,rootMargin:'-80px 0px -50% 0px'});
secs.forEach(s=>secObs.observe(s));
// Counter animation
const counters=document.querySelectorAll('.num[data-target]');
const cObs=new IntersectionObserver(entries=>{
  entries.forEach(en=>{
    if(en.isIntersecting){
      const el=en.target,target=+el.dataset.target;
      let cur=0;const step=Math.ceil(target/30);
      const timer=setInterval(()=>{cur+=step;if(cur>=target){cur=target;clearInterval(timer)}el.textContent=cur},40);
      cObs.unobserve(el);
    }
  });
},{threshold:.5});
counters.forEach(c=>cObs.observe(c));
// Back to top
const btt=document.getElementById('btt');
window.addEventListener('scroll',()=>{btt.classList.toggle('show',window.scrollY>600)},{passive:true});
btt.addEventListener('click',()=>window.scrollTo({top:0,behavior:'smooth'}));
// FAQ accordion (keyboard accessible)
document.querySelectorAll('.faq-q').forEach(b=>{
  b.addEventListener('click',()=>{
    const open=b.closest('.faq').classList.toggle('open');
    b.setAttribute('aria-expanded',open?'true':'false');
  });
});
// Drawer (aria state sync, Esc to close)
const dr=document.getElementById('dr');
const mb=document.getElementById('mb');
const setDr=o=>{dr.classList.toggle('open',o);mb.setAttribute('aria-expanded',o?'true':'false')};
mb.addEventListener('click',()=>setDr(true));
document.getElementById('dcl').addEventListener('click',()=>setDr(false));
dr.addEventListener('click',e=>{if(e.target===dr)setDr(false)});
dr.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>setDr(false)));
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&dr.classList.contains('open'))setDr(false)});
// Smooth scroll for anchor links
document.querySelectorAll('a[href^="#"]').forEach(a=>{
  a.addEventListener('click',e=>{
    e.preventDefault();
    const t=document.querySelector(a.getAttribute('href'));
    if(t)t.scrollIntoView({behavior:'smooth'});
  });
});
`;

const body=require('./landing-body.cjs');

// FAQPage structured data shares the same source as the visible FAQ.
const faqLd=JSON.stringify({"@context":"https://schema.org","@type":"FAQPage","mainEntity":body.faq.list.map(f=>({"@type":"Question","name":f[0],"acceptedAnswer":{"@type":"Answer","text":f[1]}}))});

const html=`<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Love小家 · CoupleSpace — 只属于两个人的私密空间</title>
<meta name="description" content="两个人的私密生活空间。把相册、纪念日、手写情书和双人打卡收藏在一起。开源，可自托管。">
<meta name="theme-color" content="#ffffff">
<link rel="icon" href="/favicon.ico">
<link rel="apple-touch-icon" href="/desktop-icon.png">
<link rel="manifest" href="/manifest.webmanifest">
<meta property="og:type" content="website">
<meta property="og:title" content="Love小家 · CoupleSpace — 只属于两个人的私密空间">
<meta property="og:description" content="把相册、纪念日、手写情书和双人打卡收藏在一起。开源，可自托管。">
<meta property="og:site_name" content="Love小家">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="Love小家 · CoupleSpace">
<meta name="twitter:description" content="只属于两个人的私密生活空间。开源、免费、跨平台。">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"SoftwareApplication","name":"Love小家","description":"只属于两个人的私密生活空间","applicationCategory":"LifestyleApplication","operatingSystem":"Web, Android, Windows","softwareVersion":"1.0.0","offers":{"@type":"Offer","price":"0","priceCurrency":"CNY"},"license":"https://opensource.org/licenses/MIT"}</script>
<script type="application/ld+json">${faqLd}</script>
<script>
// Apply theme before first paint: saved preference > system preference
try{var _t=localStorage.getItem('theme');if(!_t)_t=(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light';document.documentElement.setAttribute('data-theme',_t)}catch(e){}
</script>
<style>${css}</style>
</head>
<body>
<div class="bg"></div>
<div class="orb orb1"></div>
<div class="orb orb2"></div>
<div class="orb orb3"></div>
${body.nav}
${body.hero}
${body.story}
${body.compare}
${body.features}
${body.stats}
${body.showcase}
${body.how}
${body.download}
${body.platforms}
${body.tech}
${body.privacy}
${body.testimonials}
${body.license}
${body.changelog}
${body.roadmap}
${body.faq.section}
${body.cta}
${body.footer}
<script>${js}</script>
</body>
</html>`;

fs.writeFileSync(path.join(OUT,'landing.html'),html,'utf8');
fs.mkdirSync(DEPLOY,{recursive:true});
fs.writeFileSync(path.join(DEPLOY,'index.html'),html,'utf8');
console.log('✓ landing.html generated ('+html.split('\n'.replace('\\n','\n')).length+' lines) → public/ + deploy/');
