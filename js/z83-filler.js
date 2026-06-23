(() => {
  'use strict';

  const STORAGE_KEY = 'careerUnifiedZ83DraftV2';
  const PREFILL_KEY = 'careerUnifiedZ83PrefillV1';
  const ASSET_VERSION = '20260622-flat';
  const TEMPLATE_URL = `/assets/z83-template.pdf?v=${ASSET_VERSION}`;
  const FIELD_MAP_URL = `/assets/z83-field-map.json?v=${ASSET_VERSION}`;
  const HAND_FONT_URL = `/assets/fonts/Kalam-Regular.ttf?v=${ASSET_VERSION}`;
  const {PDFDocument, PDFName, rgb} = window.PDFLib || {};
  const form = document.getElementById('z83Form');
  const status = document.getElementById('formStatus');
  const progressBar = document.getElementById('progressBar');
  const completionText = document.getElementById('completionText');
  const generateButton = document.getElementById('generateBtn');
  const preview = document.getElementById('pdfPreview');
  const placeholder = document.getElementById('pdfPlaceholder');
  const cvPrefillPanel = document.getElementById('cvPrefillPanel');
  const applyCvPrefillButton = document.getElementById('applyCvPrefillBtn');
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

  function rowHasValue(row) {
    return !!row && typeof row === 'object' && Object.values(row).some(value => clean(value));
  }

  function hasValue(value) {
    if (Array.isArray(value)) return value.some(rowHasValue);
    return clean(value).length > 0;
  }

  function readCvPrefill() {
    try {
      const raw = sessionStorage.getItem(PREFILL_KEY);
      if (!raw) return null;
      const payload = JSON.parse(raw);
      const data = payload?.data && typeof payload.data === 'object' ? payload.data : payload;
      return data && typeof data === 'object' ? data : null;
    } catch {
      return null;
    }
  }

  function mergeRows(currentRows, incomingRows, limit) {
    const current = Array.isArray(currentRows) ? currentRows.filter(rowHasValue) : [];
    if (current.length) return current.slice(0, limit);
    return Array.isArray(incomingRows) ? incomingRows.filter(rowHasValue).slice(0, limit) : [];
  }

  function mergeCvPrefill(current, incoming) {
    const next = {...current};
    Object.entries(incoming).forEach(([key, value]) => {
      if (['languages', 'education', 'work', 'references', 'signatureDataUrl'].includes(key)) return;
      if (!hasValue(next[key]) && hasValue(value)) next[key] = value;
    });

    next.languages = mergeRows(current.languages, incoming.languages, 5);
    next.education = mergeRows(current.education, incoming.education, 4);
    next.work = mergeRows(current.work, incoming.work, 3);
    next.references = mergeRows(current.references, incoming.references, 3);
    return next;
  }

  function applyCvPrefill(showMessage = true) {
    const cvData = readCvPrefill();
    if (!cvData) {
      setStatus('No CV details were found. Open the CV generator and choose Prefill Z83 again.', 'error');
      return false;
    }

    const merged = mergeCvPrefill(getData(), cvData);
    setData(merged);
    saveDraft(false);
    sessionStorage.removeItem(PREFILL_KEY);
    if (cvPrefillPanel) cvPrefillPanel.hidden = true;
    if (showMessage) {
      setStatus('Your CV details were added. Review names, dates, declarations, and signature before downloading.', 'success');
    }
    return true;
  }

  function initCvPrefill() {
    const cvData = readCvPrefill();
    if (!cvData) return;

    if (cvPrefillPanel) cvPrefillPanel.hidden = false;
    const params = new URLSearchParams(window.location.search);
    if (params.get('prefill') === 'cv') {
      applyCvPrefill(true);
      params.delete('prefill');
      const query = params.toString();
      window.history.replaceState({}, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
    } else {
      setStatus('CV details are ready. Choose "Use my CV details" to prefill this Z83.');
    }
  }

  function splitMonthYear(value) {
    const text = clean(value);
    if (!text) return ['', ''];
    if (/present/i.test(text)) return ['', 'Present'];
    const iso = text.match(/^(\d{4})-(\d{2})(?:-\d{2})?$/);
    if (iso) return [String(Number(iso[2])), iso[1].slice(-2)];
    const shortDate = text.match(/(\d{1,2})\D+(\d{2,4})/);
    if (!shortDate) return ['', text];
    return [String(Number(shortDate[1])), shortDate[2].slice(-2)];
  }

  function fieldOptions(field) {
    try {
      return typeof field.getOptions === 'function' ? field.getOptions() : [];
    } catch {
      return [];
    }
  }

  function setTextField(pdfForm, name, value) {
    const text = clean(value);
    if (!text) return;
    try {
      pdfForm.getTextField(name).setText(text);
    } catch {
      // Template field names can vary between Z83 PDF versions.
    }
  }

  function selectRadio(pdfForm, name, value, valueMap = {}) {
    const selected = clean(value);
    if (!selected) return;
    try {
      const field = pdfForm.getRadioGroup(name);
      const options = fieldOptions(field);
      const mapped = valueMap[selected] || valueMap[selected.toLowerCase()] || selected;
      field.select(options.includes(selected) ? selected : mapped);
    } catch {
      // Template field names can vary between Z83 PDF versions.
    }
  }

  function selectDropdown(pdfForm, name, value) {
    const selected = clean(value);
    if (!selected) return;
    try {
      const field = pdfForm.getDropdown(name);
      const options = fieldOptions(field);
      const match = options.find(option => option.toLowerCase() === selected.toLowerCase());
      field.select(match || selected);
    } catch {
      // Template field names can vary between Z83 PDF versions.
    }
  }

  function setCheckbox(pdfForm, name, checked) {
    try {
      const field = pdfForm.getCheckBox(name);
      if (checked) field.check();
      else field.uncheck();
    } catch {
      // Template field names can vary between Z83 PDF versions.
    }
  }

  function selectYesNo(pdfForm, groupName, value) {
    const selected = clean(value);
    if (selected !== 'Yes' && selected !== 'No') return;
    selectRadio(pdfForm, groupName, selected, {Yes: 'Choice6', No: 'Choice7'});
  }

  function fillZ83Fields(pdfForm, data) {
    const raceValues = {
      African: 'Choice1',
      White: 'Choice2',
      Coloured: 'Choice3',
      Indian: 'Choice4',
      Other: 'Choice5',
    };
    const genderValues = {Female: 'Choice6', Male: 'Choice7'};
    const contactValues = {Post: 'Choice1', Email: 'Choice2', Fax: 'Choice3', Telephone: 'Choice4'};

    setTextField(pdfForm, 'Position for which you are applying as advertised', data.position);
    setTextField(pdfForm, 'Department where the position was advertised', data.department);
    setTextField(pdfForm, 'Reference number as stated in the advert', data.referenceNumber);
    setTextField(
      pdfForm,
      'If you are offered the position when can you start OR how much notice must you serve with your current employer',
      data.startDate
    );

    setTextField(pdfForm, 'Surname and Full names', [data.surname, data.fullNames].filter(Boolean).join(', '));
    setTextField(pdfForm, 'DDMMYY', formatDate(data.dateOfBirth));
    setTextField(pdfForm, 'Identity Number', data.idNumber);
    setTextField(pdfForm, 'Passport2 number', data.passportNumber);
    selectRadio(pdfForm, 'Group2', data.race, raceValues);

    [
      ['Group4', 'disability'],
      ['Group5', 'saCitizen'],
      ['Group6', 'workPermit'],
      ['Group7', 'criminalConviction'],
      ['Group8', 'pendingCriminalCase'],
      ['Group9', 'dismissedMisconduct'],
      ['Group10', 'pendingDisciplinary'],
      ['Group11', 'resignedPendingDisciplinary'],
      ['Group12', 'illHealthDischarge'],
      ['Group13', 'stateBusiness'],
      ['Group14', 'relinquishBusiness'],
    ].forEach(([groupName, key]) => selectYesNo(pdfForm, groupName, data[key]));
    selectRadio(pdfForm, 'Group3', data.gender, genderValues);

    setTextField(pdfForm, 'Text5', data.criminalDetails);
    setTextField(pdfForm, 'Text6', data.pendingCriminalDetails);
    setTextField(pdfForm, 'Text7', data.dismissalDetails);
    setTextField(pdfForm, 'Text8', data.disciplinaryDetails);
    setTextField(pdfForm, 'Text9', data.stateBusinessDetails);
    setTextField(pdfForm, 'Text10', data.privateExperience);
    setTextField(pdfForm, 'Text11', data.publicExperience);
    setTextField(pdfForm, 'Text12', formatDate(data.registrationDate));
    setTextField(pdfForm, 'Text14', data.registrationNumber);
    setTextField(pdfForm, 'Text15', data.nationality);
    setTextField(pdfForm, 'Text16', data.initials);

    setTextField(pdfForm, 'Preferred language for correspondence', data.correspondenceLanguage);
    setTextField(pdfForm, 'Contact details in terms of the above', [data.address, data.email, data.phone].filter(Boolean).join('\n'));
    selectRadio(pdfForm, 'Group16', data.contactMethod, contactValues);

    const languageFields = ['Languages specifyRow1', 'Languages specifyRow1_2', 'Languages specifyRow1_3', 'Languages specifyRow1_4', 'Languages specifyRow1_5'];
    (data.languages || []).slice(0, 5).forEach((item, index) => {
      setTextField(pdfForm, languageFields[index], item.language);
      selectDropdown(pdfForm, `Dropdown3.0.${index}`, item.speak);
      selectDropdown(pdfForm, `Dropdown3.1.${index}`, item.readWrite);
    });

    (data.education || []).slice(0, 4).forEach((item, index) => {
      const row = index + 1;
      setTextField(pdfForm, `Name of SchoolTechnical CollegeRow${row}`, item.institution);
      setTextField(pdfForm, `Name of qualification obtainedRow${row}`, item.qualification);
      setTextField(pdfForm, `Year obtainedRow${row}`, item.year);
    });
    setTextField(pdfForm, 'Current study institution and qualification', data.currentStudy);

    (data.work || []).slice(0, 3).forEach((item, index) => {
      const row = index + 1;
      setTextField(pdfForm, `Employer including current employerRow${row}`, item.employer);
      setTextField(pdfForm, `Post heldRow${row}`, item.post);
      const [fromMonth, fromYear] = splitMonthYear(item.fromYear || item.from);
      const [toMonth, toYear] = splitMonthYear(item.toYear || item.to);
      selectDropdown(pdfForm, `Dropdown1.${index}.0`, fromMonth);
      selectDropdown(pdfForm, `Dropdown1.${index}.1`, toMonth);
      setTextField(pdfForm, `YYRow${row}`, fromYear);
      setTextField(pdfForm, `YYRow${row}_2`, toYear);
      setTextField(pdfForm, `Reason for leavingRow${row}`, item.reason);
    });
    setTextField(
      pdfForm,
      'If yes Provide the name of the previous employing department and indicate the nature of the condition',
      data.reappointmentDetails
    );

    (data.references || []).slice(0, 3).forEach((item, index) => {
      const row = index + 1;
      setTextField(pdfForm, `NameRow${row}`, item.name);
      setTextField(pdfForm, `Relationship to youRow${row}`, item.relationship);
      setTextField(pdfForm, `Tel No office hoursRow${row}`, item.telephone);
    });
    setTextField(pdfForm, 'Date', formatDate(data.signatureDate));
  }

  async function embedSignature(pdfDoc, page) {
    if (!signatureDataUrl) return;
    const image = signatureDataUrl.startsWith('data:image/jpeg')
      ? await pdfDoc.embedJpg(signatureDataUrl)
      : await pdfDoc.embedPng(signatureDataUrl);
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
    const pdfForm = pdfDoc.getForm();
    const [, pageTwo] = pdfDoc.getPages();
    fillZ83Fields(pdfForm, data);
    await embedSignature(pdfDoc, pageTwo);
    pdfForm.flatten();
    pdfDoc.setTitle('Completed Z83 Application Form');
    pdfDoc.setAuthor('Career Unified browser-based Z83 filler');
    pdfDoc.setSubject('South African government application for employment');
    return pdfDoc.save();
  }

  async function generateMappedPdf(data) {
    if (!PDFDocument || !rgb || !window.fontkit) {
      throw new Error('The PDF generator did not load. Refresh the page and try again.');
    }

    const [templateResponse, fontResponse, fieldMapResponse] = await Promise.all([
      fetch(TEMPLATE_URL, {cache: 'force-cache'}),
      fetch(HAND_FONT_URL, {cache: 'force-cache'}),
      fetch(FIELD_MAP_URL, {cache: 'force-cache'}),
    ]);
    if (!templateResponse.ok || !fontResponse.ok || !fieldMapResponse.ok) {
      throw new Error('The official Z83 template resources could not be loaded.');
    }

    const [templateBytes, fontBytes, sourceFields] = await Promise.all([
      templateResponse.arrayBuffer(),
      fontResponse.arrayBuffer(),
      fieldMapResponse.json(),
    ]);
    if (!Array.isArray(sourceFields)) throw new Error('The Z83 field map is invalid.');

    const fields = sourceFields.map(field => ({...field}));
    const expandCells = (name, count) => {
      const index = fields.findIndex(field => field.n === name);
      if (index < 0) return;
      const base = fields[index];
      const cellWidth = Math.floor(base.w / count);
      const cells = Array.from({length: count}, (_, cellIndex) => ({
        t: 'txt',
        p: base.p,
        n: `${name}_${cellIndex + 1}`,
        x: base.x + cellIndex * cellWidth,
        y: base.y,
        w: cellIndex === count - 1 ? base.w - cellIndex * cellWidth : cellWidth,
        h: base.h,
      }));
      fields.splice(index, 1, ...cells);
    };
    expandCells('b_id', 13);
    expandCells('b_passport', 13);

    const getPosition = name => fields.find(field => field.n === name);
    const pdfDoc = await PDFDocument.load(templateBytes);
    if (PDFName && pdfDoc.catalog.get(PDFName.of('AcroForm'))) {
      throw new Error('The cached Z83 template is outdated. Refresh the page and try again.');
    }
    pdfDoc.registerFontkit(window.fontkit);
    const handFont = await pdfDoc.embedFont(fontBytes, {
      subset: false,
      features: {liga: false, dlig: false, clig: false},
    });
    const pages = pdfDoc.getPages();
    const black = rgb(0, 0, 0);

    const wrapMappedText = (value, size, maxWidth) => {
      const words = clean(value).split(' ').filter(Boolean);
      const lines = [];
      let line = '';
      words.forEach(word => {
        const candidate = line ? `${line} ${word}` : word;
        if (!line || handFont.widthOfTextAtSize(candidate, size) <= maxWidth) {
          line = candidate;
        } else {
          lines.push(line);
          line = word;
        }
      });
      if (line) lines.push(line);
      return lines;
    };

    const clipMappedText = (value, size, maxWidth) => {
      const text = clean(value);
      if (handFont.widthOfTextAtSize(text, size) <= maxWidth) return text;
      let clipped = text;
      while (clipped.length > 1 && handFont.widthOfTextAtSize(`${clipped}...`, size) > maxWidth) {
        clipped = clipped.slice(0, -1);
      }
      return clipped ? `${clipped.trimEnd()}...` : '';
    };

    const drawMappedText = (name, value, options = {}) => {
      const text = clean(value);
      if (!text) return;
      const position = getPosition(name);
      if (!position || !pages[position.p]) return;

      const page = pages[position.p];
      const maxWidth = Math.max(2, position.w - 4);
      const maxHeight = Math.max(2, position.h - 2);
      const requestedSize = options.size || (position.h <= 8 ? 6 : 8);
      const minimumSize = options.minSize || 5.5;
      let fontSize = requestedSize;
      let lines = options.multiline ? wrapMappedText(text, fontSize, maxWidth) : [text];

      const fits = () => {
        const lineHeight = options.lineHeight || fontSize + 2;
        const widest = Math.max(...lines.map(line => handFont.widthOfTextAtSize(line, fontSize)), 0);
        return widest <= maxWidth && lines.length * lineHeight <= maxHeight + 2;
      };
      while (fontSize > minimumSize && !fits()) {
        fontSize = Math.max(minimumSize, fontSize - 0.25);
        lines = options.multiline ? wrapMappedText(text, fontSize, maxWidth) : [text];
      }
      if (!options.multiline) lines = [clipMappedText(text, fontSize, maxWidth)];

      const marginBottom = options.marginBottom || 0;
      const offsetX = options.offsetX || 0;
      const lineHeight = options.lineHeight || fontSize + 2;
      const startY = position.y + position.h - fontSize - marginBottom;

      lines.forEach((line, index) => {
        if (!line) return;
        let drawX = position.x + 2 + offsetX;
        const textWidth = handFont.widthOfTextAtSize(line, fontSize);
        if (options.center) drawX = position.x + (position.w - textWidth) / 2 + offsetX;
        if (options.alignRight) drawX = position.x + position.w - textWidth - 2 + offsetX;
        const drawY = options.multiline
          ? startY - index * lineHeight
          : position.y + marginBottom + (position.h - fontSize) / 2;
        page.drawText(line, {x: drawX, y: drawY, size: fontSize, font: handFont, color: black});
      });
    };

    const setMappedCheck = name => {
      const position = getPosition(name);
      if (!position || !pages[position.p]) return;
      pages[position.p].drawText('X', {
        x: position.x,
        y: position.y,
        size: (position.s || 7) + 5,
        font: handFont,
        color: black,
      });
    };
    const setYesNo = (prefix, value) => {
      const answer = clean(value).toLowerCase();
      if (answer === 'yes' || answer === 'no') setMappedCheck(`${prefix}_${answer}`);
    };

    drawMappedText('a_position', data.position, {size: 10, center: true, multiline: true, lineHeight: 10});
    drawMappedText('a_department', data.department, {size: 10, center: true, multiline: true, lineHeight: 10});
    drawMappedText('a_reference', data.referenceNumber, {size: 10, center: true, multiline: true, lineHeight: 10});
    drawMappedText('a_start_date', data.startDate, {size: 10, center: true, marginBottom: 1});

    drawMappedText('initial_p1', data.initials, {size: 10, center: true, marginBottom: 1});
    drawMappedText('initial_p2', data.initials, {size: 10, center: true, marginBottom: 1});
    drawMappedText('b_surname_row1', data.surname, {size: 10, center: true, marginBottom: 1});
    drawMappedText('b_surname_row2', data.fullNames, {size: 10, center: true, marginBottom: 1});
    drawMappedText('b_dob', formatDate(data.dateOfBirth), {size: 10, center: true, marginBottom: 1});

    const drawDigits = (prefix, value, count) => {
      const digits = clean(value);
      for (let index = 0; index < count; index += 1) {
        if (!digits[index]) continue;
        const offsetX = index >= 3 && index <= 11 ? 6 : 3;
        drawMappedText(`${prefix}_${index + 1}`, digits[index], {size: 10, center: true, marginBottom: 1, offsetX});
      }
    };
    drawDigits('b_id', data.idNumber, 13);
    drawDigits('b_passport', data.passportNumber, 13);

    const race = clean(data.race).toLowerCase();
    if (['african', 'white', 'coloured', 'indian', 'other'].includes(race)) setMappedCheck(`race_${race}`);
    const gender = clean(data.gender).toLowerCase();
    if (gender === 'female' || gender === 'male') setMappedCheck(`gender_${gender}`);
    setYesNo('disability', data.disability);
    setYesNo('sa_citizen', data.saCitizen);
    setYesNo('work_permit', data.workPermit);
    setYesNo('criminal', data.criminalConviction);
    setYesNo('pending_crim', data.pendingCriminalCase);
    setYesNo('dismissed', data.dismissedMisconduct);
    setYesNo('pending_disc', data.pendingDisciplinary);
    setYesNo('resigned', data.resignedPendingDisciplinary);
    setYesNo('discharged', data.illHealthDischarge);
    setYesNo('biz_state', data.stateBusiness);
    setYesNo('relinquish', data.relinquishBusiness);
    drawMappedText('b_nationality', data.nationality, {size: 10, center: true, marginBottom: 1});

    drawMappedText('criminal_dtl', data.criminalDetails, {size: 8, alignRight: true, marginBottom: 1});
    drawMappedText('pending_crim_dtl', data.pendingCriminalDetails, {size: 8, alignRight: true, marginBottom: 1});
    drawMappedText('dismissed_dtl', data.dismissalDetails, {size: 8, alignRight: true, marginBottom: 1});
    drawMappedText('pending_disc_dtl', data.disciplinaryDetails, {size: 8, alignRight: true, marginBottom: 1});
    drawMappedText('biz_dtl', data.stateBusinessDetails, {size: 8, alignRight: true, marginBottom: 1});
    drawMappedText('exp_private', data.privateExperience, {size: 10, center: true, marginBottom: 1});
    drawMappedText('exp_public', data.publicExperience, {size: 10, center: true, marginBottom: 1});
    drawMappedText('reg_date', formatDate(data.registrationDate), {size: 8, center: true, marginBottom: 1});
    drawMappedText('reg_no', data.registrationNumber, {size: 8, center: true, marginBottom: 1});

    drawMappedText('c_language', data.correspondenceLanguage, {size: 10, center: true, marginBottom: 1});
    const contactMethod = clean(data.contactMethod).toLowerCase();
    const contactMap = {post: 'method_post', email: 'method_email', fax: 'method_fax', telephone: 'method_tel'};
    if (contactMap[contactMethod]) setMappedCheck(contactMap[contactMethod]);
    drawMappedText('c_contact', [data.address, data.email, data.phone].filter(Boolean).join(' | '), {
      size: 10,
      center: true,
      marginBottom: 1,
      multiline: true,
    });

    (data.languages || []).filter(rowHasValue).slice(0, 5).forEach((item, index) => {
      const column = index + 1;
      drawMappedText(`lang${column}_name`, item.language, {size: 10, center: true, marginBottom: 1});
      drawMappedText(`lang${column}_speak`, item.speak, {size: 10, center: true, marginBottom: 1});
      drawMappedText(`lang${column}_write`, item.readWrite, {size: 10, center: true, marginBottom: 1});
    });

    (data.education || []).filter(rowHasValue).slice(0, 4).forEach((item, index) => {
      const row = index + 1;
      drawMappedText(`qual${row}_school`, item.institution, {size: 10, center: true, marginBottom: 1});
      drawMappedText(`qual${row}_qual`, item.qualification, {size: 10, center: true, marginBottom: 1});
      drawMappedText(`qual${row}_year`, item.year, {size: 10, center: true, marginBottom: 1});
    });
    drawMappedText('current_study', data.currentStudy, {size: 10, center: true, marginBottom: 1});

    (data.work || []).filter(rowHasValue).slice(0, 3).forEach((item, index) => {
      const row = index + 1;
      const [fromMonth, fromYear] = splitMonthYear(item.fromYear || item.from);
      const [toMonth, toYear] = splitMonthYear(item.toYear || item.to);
      drawMappedText(`work${row}_employer`, item.employer, {size: 10, center: true, marginBottom: 1});
      drawMappedText(`work${row}_post`, item.post, {size: 10, center: true, marginBottom: 1});
      drawMappedText(`work${row}_from_mm`, fromMonth, {size: 10, center: true, marginBottom: 1});
      drawMappedText(`work${row}_from_yy`, fromYear, {size: 10, center: true, marginBottom: 1});
      drawMappedText(`work${row}_to_mm`, toMonth, {size: 10, center: true, marginBottom: 1});
      drawMappedText(`work${row}_to_yy`, toYear, {size: 10, center: true, marginBottom: 1});
      drawMappedText(`work${row}_reason`, item.reason, {size: 10, center: true, marginBottom: 1});
    });
    setYesNo('pub_reappoint', data.reappointmentCondition);
    drawMappedText('pub_reappoint_dtl', data.reappointmentDetails, {size: 8, alignRight: true, marginBottom: -3});

    (data.references || []).filter(rowHasValue).slice(0, 3).forEach((item, index) => {
      const row = index + 1;
      drawMappedText(`ref${row}_name`, item.name, {size: 10, center: true, marginBottom: 1});
      drawMappedText(`ref${row}_rel`, item.relationship, {size: 10, center: true, marginBottom: 1});
      drawMappedText(`ref${row}_tel`, item.telephone, {size: 10, center: true, marginBottom: 1});
    });
    drawMappedText('date', formatDate(data.signatureDate), {size: 10, center: true, marginBottom: 1});

    if (signatureDataUrl) {
      const signature = signatureDataUrl.startsWith('data:image/jpeg')
        ? await pdfDoc.embedJpg(signatureDataUrl)
        : await pdfDoc.embedPng(signatureDataUrl);
      const position = getPosition('signature');
      if (position && pages[position.p]) {
        const dimensions = signature.scaleToFit(position.w, position.h);
        pages[position.p].drawImage(signature, {
          x: position.x + (position.w - dimensions.width) / 2,
          y: position.y + (position.h - dimensions.height) / 2,
          width: dimensions.width,
          height: dimensions.height,
        });
      }
    }

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
      const bytes = await generateMappedPdf(data);
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
  applyCvPrefillButton?.addEventListener('click', () => applyCvPrefill(true));
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
  initCvPrefill();
})();
