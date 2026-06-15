(() => {
  'use strict';

  const STORAGE_KEY = 'careerUnifiedZ83DraftV2';
  const TEMPLATE_URL = '/assets/z83-template.pdf';
  const {PDFDocument, StandardFonts, rgb} = window.PDFLib || {};
  const form = document.getElementById('z83Form');
  const status = document.getElementById('formStatus');
  const progressBar = document.getElementById('progressBar');
  const completionText = document.getElementById('completionText');
  const generateButton = document.getElementById('generateBtn');
  const preview = document.getElementById('pdfPreview');
  const placeholder = document.getElementById('pdfPlaceholder');
  const canvas = document.getElementById('signatureCanvas');
  const context = canvas.getContext('2d');
  let drawing = false;
  let signatureDataUrl = '';
  let previewUrl = '';
  let saveTimer = 0;

  const rowTemplates = {
    language: () => row('language', `
      <label>Language<input data-field="language" maxlength="24"></label>
      ${ratingSelect('speak', 'Speak')}
      ${ratingSelect('readWrite', 'Write or read')}
    `),
    education: () => row('education', `
      <label>School or college<input data-field="institution"></label>
      <label>Qualification obtained<input data-field="qualification"></label>
      <label>Year obtained<input data-field="year" inputmode="numeric" maxlength="4"></label>
    `),
    work: () => row('work', `
      <label>Employer<input data-field="employer"></label>
      <label>Post held<input data-field="post"></label>
      <label>From (MM/YYYY)<input data-field="from" placeholder="01/2024"></label>
      <label>To (MM/YYYY)<input data-field="to" placeholder="Present"></label>
      <label class="full">Reason for leaving<input data-field="reason"></label>
    `),
    reference: () => row('reference', `
      <label>Name<input data-field="name"></label>
      <label>Relationship<input data-field="relationship"></label>
      <label>Telephone<input data-field="telephone" type="tel"></label>
    `)
  };

  function ratingSelect(field, label) {
    return `<label>${label}<select data-field="${field}"><option value="">Select</option><option>Good</option><option>Fair</option><option>Poor</option></select></label>`;
  }

  function row(type, fields) {
    return `<div class="repeat-row" data-row="${type}"><div class="form-grid">${fields}</div><div class="row-actions"><button type="button" class="remove-row" data-remove-row><i class="fa-regular fa-trash-can"></i> Remove</button></div></div>`;
  }

  function addRow(type, values = {}) {
    const target = document.getElementById(`${type}Rows`);
    target.insertAdjacentHTML('beforeend', rowTemplates[type]());
    const newRow = target.lastElementChild;
    Object.entries(values).forEach(([key, value]) => {
      const field = newRow.querySelector(`[data-field="${key}"]`);
      if (field) field.value = value || '';
    });
  }

  function getRows(type) {
    return Array.from(document.querySelectorAll(`[data-row="${type}"]`))
      .map(item => {
        const values = {};
        item.querySelectorAll('[data-field]').forEach(field => {
          values[field.dataset.field] = field.value.trim();
        });
        return values;
      })
      .filter(item => Object.values(item).some(Boolean));
  }

  function getData() {
    const data = Object.fromEntries(new FormData(form).entries());
    Object.keys(data).forEach(key => data[key] = String(data[key]).trim());
    data.languages = getRows('language');
    data.education = getRows('education');
    data.work = getRows('work');
    data.references = getRows('reference');
    data.signatureDataUrl = signatureDataUrl;
    return data;
  }

  function setData(data = {}) {
    Object.entries(data).forEach(([key, value]) => {
      if (Array.isArray(value) || key === 'signatureDataUrl') return;
      if (form.elements[key]) form.elements[key].value = value || '';
    });
    ['language', 'education', 'work', 'reference'].forEach(type => {
      document.getElementById(`${type}Rows`).innerHTML = '';
    });
    (data.languages || [{}]).slice(0, 5).forEach(item => addRow('language', item));
    (data.education || [{}]).slice(0, 4).forEach(item => addRow('education', item));
    (data.work || [{}]).slice(0, 3).forEach(item => addRow('work', item));
    (data.references || [{}]).slice(0, 3).forEach(item => addRow('reference', item));
    signatureDataUrl = data.signatureDataUrl || '';
    redrawStoredSignature();
    updateConditionalFields();
    updateProgress();
  }

  function setStatus(message, type = '') {
    status.textContent = message;
    status.className = `form-status ${type}`.trim();
  }

  function saveDraft(showMessage = false) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(getData()));
      if (showMessage) setStatus('Draft saved on this device.', 'success');
    } catch {
      setStatus('The draft could not be saved. Your browser storage may be full.', 'error');
    }
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveDraft(false), 300);
  }

  function loadDraft() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      setData(saved || {});
      if (saved) setStatus('Saved draft restored from this device.');
    } catch {
      setData({});
      setStatus('The saved draft was unreadable, so a fresh form was opened.', 'error');
    }
  }

  function updateProgress() {
    const data = getData();
    const required = ['position', 'department', 'referenceNumber', 'startDate', 'initials', 'surname', 'fullNames', 'signatureDate'];
    const complete = required.filter(key => data[key]).length + (signatureDataUrl ? 1 : 0);
    const percent = Math.round((complete / (required.length + 1)) * 100);
    progressBar.style.width = `${percent}%`;
    completionText.textContent = `${percent}% complete`;
  }

  function updateConditionalFields() {
    document.querySelectorAll('[data-detail-for]').forEach(question => {
      const value = form.elements[question.dataset.detailFor]?.value;
      question.classList.toggle('show-detail', value === 'Yes');
    });
  }

  function canvasPoint(event) {
    const rect = canvas.getBoundingClientRect();
    const source = event.touches ? event.touches[0] : event;
    return {
      x: (source.clientX - rect.left) * (canvas.width / rect.width),
      y: (source.clientY - rect.top) * (canvas.height / rect.height)
    };
  }

  function beginSignature(event) {
    event.preventDefault();
    drawing = true;
    const point = canvasPoint(event);
    context.beginPath();
    context.moveTo(point.x, point.y);
  }

  function drawSignature(event) {
    if (!drawing) return;
    event.preventDefault();
    const point = canvasPoint(event);
    context.lineTo(point.x, point.y);
    context.stroke();
  }

  function endSignature() {
    if (!drawing) return;
    drawing = false;
    signatureDataUrl = canvas.toDataURL('image/png');
    updateProgress();
    scheduleSave();
  }

  function clearSignature() {
    context.clearRect(0, 0, canvas.width, canvas.height);
    signatureDataUrl = '';
    updateProgress();
    scheduleSave();
  }

  function redrawStoredSignature() {
    context.clearRect(0, 0, canvas.width, canvas.height);
    if (!signatureDataUrl) return;
    const image = new Image();
    image.onload = () => context.drawImage(image, 0, 0, canvas.width, canvas.height);
    image.src = signatureDataUrl;
  }

  function formatDate(value) {
    if (!value) return '';
    const [year, month, day] = value.split('-');
    return year && month && day ? `${day}/${month}/${year.slice(-2)}` : value;
  }

  function clean(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function splitDate(value) {
    const match = clean(value).match(/(\d{1,2})\D+(\d{2,4})/);
    if (!match) return ['', ''];
    return [match[1].padStart(2, '0'), match[2].slice(-2)];
  }

  function wrapText(text, font, size, maxWidth, maxLines = 2) {
    const words = clean(text).split(' ').filter(Boolean);
    const lines = [];
    let line = '';
    words.forEach(word => {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        line = candidate;
      } else {
        if (line) lines.push(line);
        line = word;
      }
    });
    if (line) lines.push(line);
    if (lines.length > maxLines) {
      const clipped = lines.slice(0, maxLines);
      clipped[maxLines - 1] = `${clipped[maxLines - 1].replace(/[.\s]+$/, '')}...`;
      return clipped;
    }
    return lines;
  }

  function drawText(page, font, value, x, y, options = {}) {
    const text = clean(value);
    if (!text) return;
    const size = options.size || 7.2;
    const maxWidth = options.maxWidth || 150;
    const maxLines = options.maxLines || 2;
    const lineHeight = options.lineHeight || size + 1;
    wrapText(text, font, size, maxWidth, maxLines).forEach((line, index) => {
      page.drawText(line, {x, y: y - index * lineHeight, size, font, color: rgb(0, 0, 0)});
    });
  }

  function drawCentered(page, font, value, centerX, y, width, size = 7.2) {
    const text = clean(value);
    if (!text) return;
    const textWidth = font.widthOfTextAtSize(text, size);
    page.drawText(text, {x: centerX - Math.min(textWidth, width) / 2, y, size, font, color: rgb(0, 0, 0)});
  }

  function mark(page, value, expected, x, y) {
    if (clean(value).toLowerCase() !== expected.toLowerCase()) return;
    page.drawText('X', {x, y, size: 9, font: page.__font, color: rgb(0, 0, 0)});
  }

  function fillPageOne(page, font, data) {
    page.__font = font;
    drawText(page, font, data.position, 242, 636, {maxWidth: 155, maxLines: 3});
    drawText(page, font, data.department, 408, 636, {maxWidth: 164, maxLines: 3});
    drawText(page, font, data.referenceNumber, 242, 578, {maxWidth: 155});
    drawText(page, font, data.startDate, 408, 578, {maxWidth: 164, maxLines: 3});
    drawText(page, font, [data.surname, data.fullNames].filter(Boolean).join(', '), 350, 505, {maxWidth: 221});
    drawText(page, font, formatDate(data.dateOfBirth), 286, 466, {maxWidth: 60});

    clean(data.idNumber).replace(/\D/g, '').slice(0, 13).split('').forEach((digit, index) => {
      drawCentered(page, font, digit, 413 + index * 13.15, 479, 11, 7);
    });
    drawText(page, font, data.passportNumber, 405, 458, {maxWidth: 165});

    [['African', 304], ['White', 369], ['Coloured', 436], ['Indian', 506], ['Other', 559]].forEach(([value, x]) => mark(page, data.race, value, x, 450));
    [['Female', 503], ['Male', 558]].forEach(([value, x]) => mark(page, data.gender, value, x, 435));
    [['Yes', 503], ['No', 558]].forEach(([value, x]) => mark(page, data.disability, value, x, 419));
    [['Yes', 503], ['No', 558]].forEach(([value, x]) => mark(page, data.saCitizen, value, x, 404));
    drawText(page, font, data.nationality, 470, 389, {maxWidth: 100});
    [['Yes', 503], ['No', 558]].forEach(([value, x]) => mark(page, data.workPermit, value, x, 373));

    const questions = [
      ['criminalConviction', 357],
      ['pendingCriminalCase', 327],
      ['dismissedMisconduct', 296],
      ['pendingDisciplinary', 265],
      ['resignedPendingDisciplinary', 234],
      ['illHealthDischarge', 204],
      ['stateBusiness', 174],
      ['relinquishBusiness', 137]
    ];
    questions.forEach(([key, y]) => {
      mark(page, data[key], 'Yes', 503, y);
      mark(page, data[key], 'No', 558, y);
    });
    drawText(page, font, data.criminalDetails, 244, 343, {maxWidth: 325, size: 6.4});
    drawText(page, font, data.pendingCriminalDetails, 244, 312, {maxWidth: 325, size: 6.4});
    drawText(page, font, data.dismissalDetails, 244, 281, {maxWidth: 325, size: 6.4});
    drawText(page, font, data.disciplinaryDetails, 244, 250, {maxWidth: 325, size: 6.4});
    drawText(page, font, data.stateBusinessDetails, 244, 161, {maxWidth: 325, size: 6.2});
    drawCentered(page, font, data.privateExperience, 510, 111, 45);
    drawCentered(page, font, data.publicExperience, 558, 111, 45);
    drawCentered(page, font, formatDate(data.registrationDate), 510, 80, 45, 6.5);
    drawCentered(page, font, data.registrationNumber, 558, 80, 45, 6.5);
    drawText(page, font, data.initials, 548, 24, {maxWidth: 48, size: 8});
  }

  function fillPageTwo(page, font, data) {
    page.__font = font;
    drawText(page, font, data.correspondenceLanguage, 471, 696, {maxWidth: 98});
    [['Post', 350], ['Email', 420], ['Fax', 489], ['Telephone', 557]].forEach(([value, x]) => mark(page, data.contactMethod, value, x, 673));
    const contact = [data.address, data.email, data.phone].filter(Boolean).join(' | ');
    drawText(page, font, contact, 330, 643, {maxWidth: 242, maxLines: 5, size: 7, lineHeight: 8});

    const languageXs = [245, 317, 389, 461, 534];
    data.languages.slice(0, 5).forEach((item, index) => {
      drawCentered(page, font, item.language, languageXs[index], 572, 67, 6.7);
      drawCentered(page, font, item.speak, languageXs[index], 552, 67, 6.7);
      drawCentered(page, font, item.readWrite, languageXs[index], 533, 67, 6.7);
    });

    const educationYs = [474, 455, 436, 417];
    data.education.slice(0, 4).forEach((item, index) => {
      drawText(page, font, item.institution, 84, educationYs[index], {maxWidth: 180, size: 6.7, maxLines: 2});
      drawText(page, font, item.qualification, 270, educationYs[index], {maxWidth: 173, size: 6.7, maxLines: 2});
      drawCentered(page, font, item.year, 520, educationYs[index], 120, 6.7);
    });
    drawText(page, font, data.currentStudy, 206, 391, {maxWidth: 365, size: 6.7});

    const workYs = [332, 312, 292];
    data.work.slice(0, 3).forEach((item, index) => {
      const [fromMonth, fromYear] = splitDate(item.from);
      const [toMonth, toYear] = splitDate(item.to);
      drawText(page, font, item.employer, 84, workYs[index], {maxWidth: 132, size: 6.3, maxLines: 2});
      drawText(page, font, item.post, 222, workYs[index], {maxWidth: 84, size: 6.3, maxLines: 2});
      drawCentered(page, font, fromMonth, 325, workYs[index], 26, 6.3);
      drawCentered(page, font, fromYear, 355, workYs[index], 29, 6.3);
      drawCentered(page, font, toMonth, 385, workYs[index], 26, 6.3);
      drawCentered(page, font, toYear, 417, workYs[index], 29, 6.3);
      drawText(page, font, item.reason, 442, workYs[index], {maxWidth: 129, size: 6.3, maxLines: 2});
    });
    mark(page, data.reappointmentCondition, 'Yes', 460, 267);
    mark(page, data.reappointmentCondition, 'No', 501, 267);
    drawText(page, font, data.reappointmentDetails, 375, 248, {maxWidth: 196, size: 6.4, maxLines: 2});

    const referenceYs = [194, 176, 158];
    data.references.slice(0, 3).forEach((item, index) => {
      drawText(page, font, item.name, 84, referenceYs[index], {maxWidth: 140, size: 6.7});
      drawText(page, font, item.relationship, 234, referenceYs[index], {maxWidth: 140, size: 6.7});
      drawText(page, font, item.telephone, 384, referenceYs[index], {maxWidth: 185, size: 6.7});
    });
    drawText(page, font, formatDate(data.signatureDate), 439, 80, {maxWidth: 100, size: 8});
    drawText(page, font, data.initials, 548, 24, {maxWidth: 48, size: 8});
  }

  async function embedSignature(pdfDoc, page) {
    if (!signatureDataUrl) return;
    const bytes = await fetch(signatureDataUrl).then(response => response.arrayBuffer());
    const image = signatureDataUrl.startsWith('data:image/jpeg')
      ? await pdfDoc.embedJpg(bytes)
      : await pdfDoc.embedPng(bytes);
    const scale = Math.min(1, 180 / image.width, 38 / image.height);
    const width = image.width * scale;
    const height = image.height * scale;
    page.drawImage(image, {x: 83, y: 66, width, height});
  }

  async function generatePdf(data) {
    if (!PDFDocument) throw new Error('The PDF generator did not load. Refresh the page and try again.');
    const templateBytes = await fetch(TEMPLATE_URL, {cache: 'force-cache'}).then(response => {
      if (!response.ok) throw new Error('The official Z83 template could not be loaded.');
      return response.arrayBuffer();
    });
    const pdfDoc = await PDFDocument.load(templateBytes);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const [pageOne, pageTwo] = pdfDoc.getPages();
    fillPageOne(pageOne, font, data);
    fillPageTwo(pageTwo, font, data);
    await embedSignature(pdfDoc, pageTwo);
    pdfDoc.setTitle('Completed Z83 Application Form');
    pdfDoc.setAuthor('Career Unified browser-based Z83 filler');
    pdfDoc.setSubject('South African government application for employment');
    return pdfDoc.save();
  }

  function downloadPdf(bytes, data) {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    const blob = new Blob([bytes], {type: 'application/pdf'});
    previewUrl = URL.createObjectURL(blob);
    preview.src = `${previewUrl}#view=FitH`;
    preview.style.display = 'block';
    placeholder.style.display = 'none';
    const link = document.createElement('a');
    const surname = clean(data.surname).replace(/[^a-z0-9]+/gi, '-') || 'Application';
    link.href = previewUrl;
    link.download = `Z83-${surname}.pdf`;
    link.click();
  }

  async function handleSubmit(event) {
    event.preventDefault();
    updateConditionalFields();
    if (!form.reportValidity()) return;
    if (!signatureDataUrl) {
      setStatus('Please draw or upload your signature before generating the form.', 'error');
      document.getElementById('section-signature').scrollIntoView({behavior: 'smooth'});
      return;
    }
    generateButton.disabled = true;
    generateButton.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Generating PDF';
    setStatus('Writing your details onto the official Z83 form...');
    try {
      const data = getData();
      const bytes = await generatePdf(data);
      downloadPdf(bytes, data);
      saveDraft(false);
      setStatus('Your signed Z83 PDF is ready. Review both pages before applying.', 'success');
      window.gtag?.('event', 'z83_pdf_generate', {event_category: 'career_tool'});
    } catch (error) {
      console.error(error);
      setStatus(error.message || 'The PDF could not be generated. Please try again.', 'error');
    } finally {
      generateButton.disabled = false;
      generateButton.innerHTML = '<i class="fa-solid fa-download"></i> Generate signed Z83 PDF';
    }
  }

  context.lineWidth = 3;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.strokeStyle = '#101828';
  canvas.addEventListener('pointerdown', beginSignature);
  canvas.addEventListener('pointermove', drawSignature);
  canvas.addEventListener('pointerup', endSignature);
  canvas.addEventListener('pointerleave', endSignature);

  document.getElementById('signatureUpload').addEventListener('change', event => {
    const file = event.target.files[0];
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 3 * 1024 * 1024) {
      setStatus('Choose a PNG, JPG, or WebP signature image smaller than 3 MB.', 'error');
      event.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        context.clearRect(0, 0, canvas.width, canvas.height);
        const scale = Math.min(canvas.width / image.width, canvas.height / image.height);
        const width = image.width * scale;
        const height = image.height * scale;
        context.drawImage(image, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
        signatureDataUrl = canvas.toDataURL('image/png');
        updateProgress();
        scheduleSave();
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });

  document.getElementById('clearSignature').addEventListener('click', clearSignature);
  document.getElementById('saveBtn').addEventListener('click', () => saveDraft(true));
  document.getElementById('clearBtn').addEventListener('click', () => {
    if (!window.confirm('Clear all Z83 answers and the signature saved on this device?')) return;
    localStorage.removeItem(STORAGE_KEY);
    form.reset();
    clearSignature();
    setData({});
    setStatus('The form and saved draft were cleared.');
  });
  document.querySelectorAll('[data-add-row]').forEach(button => {
    button.addEventListener('click', () => {
      const type = button.dataset.addRow;
      const limits = {language: 5, education: 4, work: 3, reference: 3};
      if (document.querySelectorAll(`[data-row="${type}"]`).length >= limits[type]) {
        setStatus(`The official form has space for ${limits[type]} ${type} entries.`, 'error');
        return;
      }
      addRow(type);
      scheduleSave();
    });
  });
  document.addEventListener('click', event => {
    const remove = event.target.closest('[data-remove-row]');
    if (remove) {
      remove.closest('.repeat-row').remove();
      updateProgress();
      scheduleSave();
    }
    const jump = event.target.closest('[data-jump]');
    if (jump) {
      document.querySelectorAll('[data-jump]').forEach(button => button.classList.remove('active'));
      jump.classList.add('active');
      document.getElementById(jump.dataset.jump).scrollIntoView({behavior: 'smooth', block: 'start'});
    }
  });
  form.addEventListener('input', () => {
    updateConditionalFields();
    updateProgress();
    scheduleSave();
  });
  form.addEventListener('submit', handleSubmit);
  window.addEventListener('beforeunload', () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  });

  loadDraft();
})();
