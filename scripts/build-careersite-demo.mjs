import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const width = 1280
const height = 720
const fps = 24
const duration = 18
const totalFrames = fps * duration
const outputDir = path.resolve('assets/videos')
const posterPath = path.resolve('assets/images/recruiter-career-site-demo-poster.jpg')
const videoPath = path.join(outputDir, 'recruiter-career-site-demo.mp4')
const ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg'
const previewPath = path.resolve('tmp/recruiter-career-site-demo-contact.jpg')

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value))
const easeOut = (value) => 1 - Math.pow(1 - clamp(value), 3)
const escapeXml = (value) => String(value).replace(/[<>&"']/g, (char) => ({
  '<': '&lt;',
  '>': '&gt;',
  '&': '&amp;',
  '"': '&quot;',
  "'": '&apos;'
})[char])

const copy = (lines, x, y, size = 48, color = '#15233e', weight = 700, lineHeight = 1.1) =>
  `<text x="${x}" y="${y}" font-size="${size}" fill="${color}" font-weight="${weight}">${lines.map((line, index) => `<tspan x="${x}" dy="${index ? size * lineHeight : 0}">${escapeXml(line)}</tspan>`).join('')}</text>`

const text = (value, x, y, size, color = '#66748d', weight = 500, extra = '') =>
  `<text x="${x}" y="${y}" font-size="${size}" fill="${color}" font-weight="${weight}" ${extra}>${escapeXml(value)}</text>`

function browserFrame(content, address = 'careers.northstar.com') {
  return `
    <g filter="url(#shadow)">
      <rect x="554" y="112" width="654" height="498" rx="22" fill="#fff"/>
    </g>
    <path d="M576 112h610a22 22 0 0 1 22 22v38H554v-38a22 22 0 0 1 22-22z" fill="#f7f9fc"/>
    <circle cx="579" cy="138" r="5" fill="#ff8177"/><circle cx="597" cy="138" r="5" fill="#ffcb57"/><circle cx="615" cy="138" r="5" fill="#55c991"/>
    <rect x="704" y="126" width="344" height="24" rx="12" fill="#fff" stroke="#e5eaf3"/>
    ${text(address, 876, 142, 11, '#77839a', 500, 'text-anchor="middle"')}
    <g>${content}</g>
  `
}

function brandScene(progress) {
  const slide = 20 * (1 - progress)
  return browserFrame(`
    <rect x="555" y="172" width="652" height="438" fill="#fff"/>
    <rect x="555" y="172" width="652" height="55" fill="#fff"/>
    <circle cx="591" cy="199" r="16" fill="#275ed5"/><path d="M584 202l7-10 7 10-7 5z" fill="#fff"/>
    ${text('northstar', 616, 203, 18, '#1a2940', 700)}
    ${text('About', 928, 202, 12, '#69768d', 600)}${text('Teams', 985, 202, 12, '#69768d', 600)}
    ${text('Careers', 1042, 202, 12, '#275ed5', 700)}
    <rect x="1087" y="185" width="87" height="28" rx="14" fill="#275ed5"/>
    ${text('View roles', 1130, 203, 11, '#fff', 700, 'text-anchor="middle"')}
    <rect x="555" y="227" width="652" height="222" fill="#eef4ff"/>
    <circle cx="1137" cy="339" r="102" fill="#d8e8ff"/>
    <circle cx="1094" cy="369" r="57" fill="#b6d4ff"/>
    <path d="M1031 385c25-63 74-95 134-88 22 3 42 12 59 27v125h-193z" fill="#8fb9fa"/>
    ${text('Careers at Northstar', 594, 283, 13, '#275ed5', 700)}
    ${copy(['Make your next move', 'meaningful.'], 594, 329, 30, '#172944', 700, 1.12)}
    ${text('Bring your ideas. Do work that matters.', 594, 398, 13, '#586985', 500)}
    <rect x="594" y="414" width="111" height="28" rx="14" fill="#275ed5"/>
    ${text('Explore careers', 649, 432, 11, '#fff', 700, 'text-anchor="middle"')}
    ${text('Find your place here', 584, 482, 14, '#182944', 700)}
    ${text('A team where good work and good people grow together.', 584, 501, 10, '#77839a', 500)}
    <g>
      <rect x="584" y="517" width="183" height="67" rx="12" fill="#fff" stroke="#e7ecf4"/>
      <rect x="779" y="517" width="183" height="67" rx="12" fill="#fff" stroke="#e7ecf4"/>
      <rect x="974" y="517" width="205" height="67" rx="12" fill="#fff" stroke="#e7ecf4"/>
      <circle cx="607" cy="540" r="10" fill="#e9f2ff"/><circle cx="802" cy="540" r="10" fill="#e9f2ff"/><circle cx="997" cy="540" r="10" fill="#e9f2ff"/>
      ${text('Product & Engineering', 625, 543, 10, '#263752', 700)}
      ${text('People & Culture', 820, 543, 10, '#263752', 700)}
      ${text('Customer Experience', 1015, 543, 10, '#263752', 700)}
      ${text('8 open roles', 601, 566, 9, '#77839a', 500)}${text('4 open roles', 796, 566, 9, '#77839a', 500)}${text('6 open roles', 991, 566, 9, '#77839a', 500)}
    </g>
    <g transform="translate(${slide} 0)" opacity="${progress}">
      <rect x="963" y="230" width="218" height="238" rx="16" fill="#fff" stroke="#e1e8f2" filter="url(#shadowSoft)"/>
      ${text('SITE BRANDING', 982, 258, 10, '#72809a', 700, 'letter-spacing="1"')}
      <rect x="982" y="273" width="41" height="41" rx="12" fill="#eef4ff"/>
      <circle cx="1002" cy="293" r="11" fill="#275ed5"/><path d="M997 296l5-7 5 7-5 4z" fill="#fff"/>
      ${text('Company logo', 1034, 291, 11, '#293953', 700)}${text('Northstar brand', 1034, 307, 9, '#7a879a', 500)}
      <path d="M982 329h180" stroke="#edf0f6"/>
      ${text('Brand colours', 982, 352, 10, '#293953', 700)}
      <circle cx="990" cy="375" r="10" fill="#275ed5"/><circle cx="1018" cy="375" r="10" fill="#18365a"/><circle cx="1046" cy="375" r="10" fill="#b6dfd5"/><circle cx="1074" cy="375" r="10" fill="#f1c66b"/>
      ${text('Page style', 982, 410, 10, '#293953', 700)}
      <rect x="982" y="423" width="78" height="27" rx="8" fill="#f7f9fc" stroke="#e3e9f2"/>
      ${text('Modern', 1021, 441, 9, '#516079', 600, 'text-anchor="middle"')}
      <rect x="1067" y="423" width="95" height="27" rx="8" fill="#eef4ff"/>
      ${text('Preview site', 1114, 441, 9, '#275ed5', 700, 'text-anchor="middle"')}
    </g>
  `)
}

function aiScene(progress) {
  const words = ['In this role, you will build trusted customer relationships,', 'guide new teams through onboarding, and turn feedback into', 'clear product improvements. We are looking for a thoughtful', 'communicator who enjoys solving meaningful problems.']
  const reveal = Math.round(clamp((progress - 0.12) / 0.64) * words.join(' ').length)
  const full = words.join(' ')
  const generated = full.slice(0, reveal)
  const lines = []
  for (let start = 0; start < generated.length; start += 58) lines.push(generated.slice(start, start + 58))
  return browserFrame(`
    <rect x="555" y="172" width="652" height="438" fill="#f7f9fc"/>
    <rect x="555" y="172" width="652" height="47" fill="#fff"/>
    ${text('Jobs', 580, 201, 13, '#273752', 700)}${text('›', 612, 201, 16, '#99a5b8', 500)}${text('New job', 627, 201, 12, '#7b879b', 500)}
    <rect x="578" y="239" width="606" height="344" rx="16" fill="#fff" stroke="#e3e9f2"/>
    ${text('Create a job post', 604, 275, 18, '#1b2b46', 700)}
    ${text('Add the role details. AI can draft the description for you.', 604, 296, 10, '#74819a', 500)}
    ${text('Job title', 604, 327, 10, '#33435d', 700)}
    <rect x="604" y="337" width="390" height="34" rx="9" fill="#fff" stroke="#e1e7f0"/>
    ${text('Customer Success Manager', 619, 359, 11, '#293953', 600)}
    ${text('Location', 1012, 327, 10, '#33435d', 700)}
    <rect x="1012" y="337" width="148" height="34" rx="9" fill="#fff" stroke="#e1e7f0"/>
    ${text('Cape Town · Hybrid', 1025, 359, 10, '#56637a', 500)}
    ${text('Job description', 604, 401, 10, '#33435d', 700)}
    <rect x="604" y="411" width="556" height="137" rx="10" fill="#fff" stroke="#d9e4f7"/>
    <rect x="604" y="411" width="556" height="33" rx="10" fill="#f6f9ff"/>
    <path d="M604 443h556" stroke="#e8edf5"/>
    <circle cx="623" cy="428" r="8" fill="#e7efff"/><path d="M623 422v12m-5-6h10" stroke="#2f6de0" stroke-width="1.7" stroke-linecap="round"/>
    ${text(progress > 0.18 ? 'AI is drafting a clear first version' : 'Start with a blank description', 640, 432, 10, '#2c5fc8', 700)}
    ${lines.map((line, index) => text(line, 621, 469 + index * 20, 9, '#53627b', 500)).join('')}
    <rect x="604" y="558" width="142" height="10" rx="5" fill="#e9eef7"/>
    <rect x="604" y="558" width="${142 * clamp(progress / 0.75)}" height="10" rx="5" fill="#5b8ef0"/>
    <rect x="1016" y="574" width="144" height="32" rx="10" fill="#275ed5"/>
    ${text('Save job draft', 1088, 595, 10, '#fff', 700, 'text-anchor="middle"')}
    <g opacity="${easeOut(progress)}">
      <rect x="864" y="217" width="303" height="48" rx="14" fill="#fff" stroke="#dfe7f6" filter="url(#shadowSoft)"/>
      <circle cx="888" cy="241" r="10" fill="#eef4ff"/>
      <path d="m888 233 2.5 6 5.5 2-5.5 2-2.5 6-2-6-6-2 6-2z" fill="#2f6de0"/>
      ${text('AI job-description autofill', 908, 245, 11, '#2d4265', 700)}
      <rect x="1099" y="231" width="51" height="20" rx="10" fill="#e9f8f2"/>
      ${text('Ready', 1124, 245, 9, '#148968', 700, 'text-anchor="middle"')}
    </g>
  `, 'app.careerunified.com/jobs/new')
}

function embedScene(progress) {
  const cardY = 464 + (1 - progress) * 22
  return browserFrame(`
    <rect x="555" y="172" width="652" height="438" fill="#fff"/>
    <rect x="555" y="172" width="652" height="51" fill="#fff"/>
    <circle cx="592" cy="197" r="15" fill="#245fd7"/><path d="M585 200l7-10 7 10-7 5z" fill="#fff"/>
    ${text('northstar', 616, 201, 17, '#192940', 700)}
    ${text('Home', 887, 201, 11, '#66748c', 600)}${text('About', 938, 201, 11, '#66748c', 600)}${text('Solutions', 989, 201, 11, '#66748c', 600)}
    ${text('Careers', 1064, 201, 11, '#265ed5', 700)}
    <rect x="555" y="223" width="652" height="164" fill="#edf3fc"/>
    <path d="M555 360c100-51 190-45 280-4 101 47 228 33 372-58v89H555z" fill="#d9e7fa"/>
    ${text('NORTHSTAR  /  CAREERS', 589, 261, 9, '#285ec9', 700, 'letter-spacing="1.1"')}
    ${copy(['Find work that', 'moves us forward.'], 589, 303, 26, '#192940', 700, 1.12)}
    <rect x="589" y="348" width="103" height="25" rx="13" fill="#275ed5"/>
    ${text('Explore careers', 640, 365, 9, '#fff', 700, 'text-anchor="middle"')}
    <rect x="574" y="404" width="616" height="182" rx="13" fill="#fff" stroke="#e2e9f2"/>
    <circle cx="598" cy="430" r="11" fill="#eaf1ff"/><path d="M595 430h6m-3-3v6" stroke="#2f6de0" stroke-width="1.8" stroke-linecap="round"/>
    ${text('Open roles', 619, 434, 14, '#1d2e48', 700)}${text('Find your next opportunity at Northstar.', 619, 452, 9, '#74819a', 500)}
    <path d="M592 468h580" stroke="#edf1f6"/>
    <g>
      <rect x="592" y="481" width="580" height="36" rx="8" fill="#fafbfe"/>
      ${text('Customer Success Manager', 606, 496, 10, '#2b3a53', 700)}${text('Cape Town · Hybrid', 606, 510, 8, '#7a8799', 500)}
      <rect x="1098" y="488" width="58" height="22" rx="11" fill="#edf3ff"/>${text('View role', 1127, 503, 8, '#275ed5', 700, 'text-anchor="middle"')}
      <rect x="592" y="524" width="580" height="36" rx="8" fill="#fafbfe"/>
      ${text('Product Designer', 606, 539, 10, '#2b3a53', 700)}${text('Remote · Full time', 606, 553, 8, '#7a8799', 500)}
      <rect x="1098" y="531" width="58" height="22" rx="11" fill="#edf3ff"/>${text('View role', 1127, 546, 8, '#275ed5', 700, 'text-anchor="middle"')}
    </g>
    <g transform="translate(0 ${cardY - 464})" opacity="${easeOut(progress)}">
      <rect x="735" y="463" width="447" height="110" rx="15" fill="#fff" stroke="#dfe7f2" filter="url(#shadowSoft)"/>
      <circle cx="761" cy="489" r="11" fill="#e7f8f0"/>
      <path d="m756 489 4 4 7-8" fill="none" stroke="#168b66" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/>
      ${text('Embedded on northstar.com', 782, 493, 11, '#243550', 700)}
      <rect x="757" y="508" width="400" height="45" rx="9" fill="#f6f8fc"/>
      ${text('&lt;iframe src="careers.northstar.com"&gt;', 772, 535, 9, '#47607e', 500, 'font-family="monospace"')}
      <rect x="1089" y="515" width="55" height="29" rx="9" fill="#275ed5"/>
      ${text('Copied', 1116, 534, 8, '#fff', 700, 'text-anchor="middle"')}
    </g>
  `, 'northstar.com/careers')
}

function finishScene(progress) {
  return browserFrame(`
    <rect x="555" y="172" width="652" height="438" fill="#fff"/>
    <rect x="555" y="172" width="652" height="55" fill="#fff"/>
    <circle cx="592" cy="199" r="16" fill="#275ed5"/><path d="M585 202l7-10 7 10-7 5z" fill="#fff"/>
    ${text('northstar', 616, 203, 18, '#1a2940', 700)}
    ${text('About', 928, 202, 12, '#69768d', 600)}${text('Teams', 985, 202, 12, '#69768d', 600)}${text('Careers', 1042, 202, 12, '#275ed5', 700)}
    <rect x="555" y="227" width="652" height="225" fill="#eaf2ff"/>
    <circle cx="1120" cy="331" r="103" fill="#d4e4ff"/>
    <circle cx="1162" cy="363" r="66" fill="#b9d3fc"/>
    <path d="M1044 398c37-74 104-112 181-92v146h-181z" fill="#91b7f3"/>
    ${text('NORTHSTAR CAREERS', 594, 274, 11, '#275ed5', 700, 'letter-spacing="1"')}
    ${copy(['Good work starts', 'with good people.'], 594, 318, 29, '#1a2b46', 700, 1.12)}
    ${text('A welcoming, branded experience from first click to application.', 594, 394, 10, '#5d6b82', 500)}
    <rect x="594" y="410" width="108" height="29" rx="15" fill="#275ed5"/>${text('See open roles', 648, 429, 10, '#fff', 700, 'text-anchor="middle"')}
    <g>
      <rect x="584" y="470" width="185" height="91" rx="14" fill="#fff" stroke="#e6ebf3"/>
      <rect x="779" y="470" width="185" height="91" rx="14" fill="#fff" stroke="#e6ebf3"/>
      <rect x="974" y="470" width="205" height="91" rx="14" fill="#fff" stroke="#e6ebf3"/>
      <circle cx="608" cy="497" r="13" fill="#edf3ff"/><path d="M602 498h12m-6-6v12" stroke="#2f6de0" stroke-width="2" stroke-linecap="round"/>
      <circle cx="803" cy="497" r="13" fill="#e8f7f1"/><path d="m798 497 4 4 7-8" fill="none" stroke="#15966f" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="998" cy="497" r="13" fill="#fff3d9"/><path d="M993 493h10v8h-10zM995 490h6" fill="none" stroke="#bc8a20" stroke-width="1.8" stroke-linecap="round"/>
      ${text('Your brand', 631, 501, 10, '#263650', 700)}${text('AI job drafts', 826, 501, 10, '#263650', 700)}${text('Embedded site', 1021, 501, 10, '#263650', 700)}
      ${text('Logo, colours, story', 600, 530, 8, '#74819a', 500)}${text('Clear role descriptions', 795, 530, 8, '#74819a', 500)}${text('One seamless experience', 990, 530, 8, '#74819a', 500)}
    </g>
    <rect x="828" y="572" width="108" height="26" rx="13" fill="#275ed5" opacity="${easeOut(progress)}"/>
    ${text('Start building', 882, 589, 9, '#fff', 700, 'text-anchor="middle"')}
  `)
}

const scenes = [brandScene, aiScene, embedScene, finishScene]
const titles = [
  ['A careers site', 'that feels like', 'your company.'],
  ['Let AI fill in', 'the first draft.'],
  ['Bring careers', 'into your', 'company site.'],
  ['A better way', 'to welcome', 'every applicant.']
]
const descriptions = [
  ['Showcase your logo, colours, story,', 'and every open role in one polished site.'],
  ['Turn a few role details into a clear,', 'well-structured job description.'],
  ['Embed your branded careers page right', 'inside your existing company website.'],
  ['One connected experience, from your', 'company brand to candidate application.']
]
const labels = ['Brand your careers site', 'AI job-description autofill', 'Embed on your website', 'Publish and grow']

function renderSvg(time) {
  const sceneSpan = duration / scenes.length
  const index = Math.min(scenes.length - 1, Math.floor(time / sceneSpan))
  const local = (time - index * sceneSpan) / sceneSpan
  const enter = easeOut(local / 0.22)
  const sceneMarkup = scenes[index](local)
  const previousMarkup = index > 0 && local < 0.22 ? scenes[index - 1](1) : ''
  const previousOpacity = index > 0 ? 1 - enter : 0
  const activeOpacity = index > 0 ? enter : easeOut(Math.min(1, time / 0.48))
  const titleY = 233 + (1 - activeOpacity) * 14
  const copyY = 432 + (1 - activeOpacity) * 12
  const title = copy(titles[index], 76, titleY, 49, '#16243d', 750, 1.08)
  const description = descriptions[index].map((line, lineIndex) => text(line, 79, copyY + lineIndex * 25, 16, '#64728a', 500)).join('')
  const stage = index + 1
  const progressWidth = 45 + 260 * local

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <defs>
        <linearGradient id="bg" x2="1" y2="1"><stop stop-color="#f8fbff"/><stop offset="1" stop-color="#eef4fc"/></linearGradient>
        <linearGradient id="wash" x2="0.9" y2="1"><stop stop-color="#e7f0ff" stop-opacity=".86"/><stop offset="1" stop-color="#f8fbff" stop-opacity="0"/></linearGradient>
        <filter id="shadow" x="-20%" y="-20%" width="140%" height="155%"><feDropShadow dx="0" dy="16" stdDeviation="20" flood-color="#203c73" flood-opacity=".13"/></filter>
        <filter id="shadowSoft" x="-20%" y="-20%" width="140%" height="160%"><feDropShadow dx="0" dy="8" stdDeviation="10" flood-color="#233b68" flood-opacity=".12"/></filter>
        <style>text{font-family:Inter,Arial,sans-serif;}</style>
      </defs>
      <rect width="1280" height="720" fill="url(#bg)"/>
      <circle cx="158" cy="160" r="260" fill="url(#wash)"/>
      <circle cx="1110" cy="655" r="260" fill="#e9f2ff" opacity=".58"/>
      <circle cx="506" cy="580" r="3" fill="#bbd1f7"/><circle cx="462" cy="612" r="2" fill="#bfd6f5"/>
      <circle cx="1240" cy="94" r="5" fill="#c9dafa" opacity=".8"/>
      <g>
        <circle cx="91" cy="64" r="19" fill="#245fd7"/><path d="M83 68l8-12 8 12-8 6z" fill="#fff"/>
        ${text('Career Unified', 120, 69, 17, '#1a2943', 700)}
        ${text('CAREER SITE BUILDER', 77, 152, 11, '#2d64d2', 700, 'letter-spacing="1.6"')}
        <rect x="77" y="168" width="77" height="4" rx="2" fill="#d9e5f9"/><rect x="77" y="168" width="${progressWidth}" height="4" rx="2" fill="#2e68df"/>
        <g opacity="${activeOpacity}" transform="translate(0 ${14 * (1 - activeOpacity)})">${title}${description}</g>
        <g opacity="${activeOpacity}" transform="translate(0 ${9 * (1 - activeOpacity)})">
          <rect x="77" y="510" width="${index === 0 ? 230 : index === 1 ? 262 : 224}" height="34" rx="17" fill="#e5edfc"/>
          <circle cx="96" cy="527" r="6" fill="#2d68dd"/>
          ${text(labels[index], 111, 531, 12, '#244f9f', 700)}
        </g>
        <g opacity="${previousOpacity}" transform="translate(0 -8)">
          ${copy(titles[Math.max(0,index-1)], 76, 233, 49, '#16243d', 750, 1.08)}
        </g>
      </g>
      <g opacity="${previousOpacity}" transform="translate(0 -8)">${previousMarkup}</g>
      <g opacity="${activeOpacity}" transform="translate(0 ${12 * (1 - activeOpacity)})">${sceneMarkup}</g>
      <g>
        <path d="M78 636H1202" stroke="#dfe7f2" stroke-width="1.5"/>
        <path d="M78 636h${Math.max(0, (stage - 1) * 65 + 65 * local)}" stroke="#2d68dd" stroke-width="2.5" stroke-linecap="round"/>
        ${scenes.map((_, step) => {
          const x = 78 + step * 65
          const selected = step === index
          const complete = step < index
          const fill = selected || complete ? '#2d68dd' : '#cbd5e5'
          return `<circle cx="${x}" cy="636" r="${selected ? 6 : 4}" fill="${fill}"/>`
        }).join('')}
        ${text('Brand', 78, 662, 10, index === 0 ? '#1d4fae' : '#7b8799', 700)}
        ${text('AI job copy', 143, 662, 10, index === 1 ? '#1d4fae' : '#7b8799', 700)}
        ${text('Embed', 208, 662, 10, index === 2 ? '#1d4fae' : '#7b8799', 700)}
        ${text('Publish', 273, 662, 10, index === 3 ? '#1d4fae' : '#7b8799', 700)}
        ${text(`${String(stage).padStart(2, '0')} / 04`, 1195, 662, 10, '#6f7d95', 700, 'text-anchor="end"')}
      </g>
    </svg>
  `
}

async function frameBuffer(time) {
  const svgBuffer = Buffer.from(renderSvg(time))
  return sharp(svgBuffer).resize(width, height).removeAlpha().raw().toBuffer()
}

if (process.argv.includes('--contact-sheet')) {
  const samples = [2.4, 6.8, 11.2, 15.5]
  const frames = await Promise.all(samples.map((time) =>
    sharp(Buffer.from(renderSvg(time))).resize(640, 360).jpeg({ quality: 86 }).toBuffer()
  ))
  const contactSheet = await sharp({
    create: { width: 1280, height: 720, channels: 3, background: '#edf2f8' }
  }).composite(frames.map((input, index) => ({ input, left: (index % 2) * 640, top: Math.floor(index / 2) * 360 }))).jpeg({ quality: 90 }).toBuffer()
  await writeFile(previewPath, contactSheet)
  console.log(`Created frame preview: ${previewPath}`)
  process.exit(0)
}

await mkdir(outputDir, { recursive: true })
const posterFrame = await sharp(Buffer.from(renderSvg(2.4))).jpeg({ quality: 87, mozjpeg: true }).toBuffer()
await writeFile(posterPath, posterFrame)

const args = [
  '-hide_banner', '-loglevel', 'error', '-y',
  '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s:v', `${width}x${height}`, '-r', String(fps), '-i', 'pipe:0',
  '-an', '-c:v', 'libopenh264', '-b:v', '3200k', '-maxrate', '3800k', '-bufsize', '6400k',
  '-pix_fmt', 'yuv420p', '-r', String(fps), '-g', String(fps * 2),
  '-movflags', '+faststart', videoPath
]
const encoder = spawn(ffmpegPath, args, { stdio: ['pipe', 'ignore', 'pipe'] })
let encoderError = ''
encoder.stderr.setEncoding('utf8')
encoder.stderr.on('data', (chunk) => { encoderError += chunk })
const encoderClosed = new Promise((resolve) => {
  encoder.once('close', (code, signal) => resolve({ code, signal }))
})

for (let frame = 0; frame < totalFrames; frame += 1) {
  const time = frame / fps
  const pixels = await frameBuffer(time)
  const accepted = encoder.stdin.write(pixels)
  if (!accepted) {
    const outcome = await Promise.race([
      once(encoder.stdin, 'drain').then(() => 'drain'),
      encoderClosed.then(() => 'closed')
    ])
    if (outcome === 'closed') throw new Error(`ffmpeg closed early: ${encoderError}`)
  }
}
encoder.stdin.end()
const { code: exitCode } = await encoderClosed
if (exitCode !== 0) throw new Error(`ffmpeg failed with code ${exitCode}: ${encoderError}`)
console.log(`Created silent video: ${videoPath}`)
console.log(`Created poster: ${posterPath}`)
