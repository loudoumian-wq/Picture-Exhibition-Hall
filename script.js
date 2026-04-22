/**
 * Vision | The Collection — Spatial Interactions
 * Pure static version for Vercel deployment
 */

const STORAGE_KEY = 'vision_gallery_data';

let photos = [];
let filteredPhotos = [];
let currentLb = -1;
let pickedFiles = [];
let currentFilter = 'All';
let currentSearch = '';
let currentView = 'gallery';
let currentPerson = null;

// ── DOM Nodes ────────────────────────────────────────────
const $ = id => document.getElementById(id);
const viewGallery = $('view-gallery');
const viewPeople = $('view-people');
const grid = $('gallery-grid');
const peopleGrid = $('people-grid');
const personDetailView = $('person-detail-view');
const personGalleryGrid = $('person-gallery-grid');
const emptyState = $('empty-state');
const catFilters = $('category-filters');

// Command Palette
const paletteOverlay = $('palette-overlay');
const paletteInput = $('palette-input');
const btnSearch = $('btn-search');

// Cursor
const cursorDot = $('cursor-dot');
const cursorRing = $('cursor-ring');

// Upload Modal
const uploadOverlay = $('upload-overlay');
const uploadModal = $('upload-modal');
const dropzone = $('dropzone');
const dropContent = $('drop-content');
const uploadPreview = $('upload-preview');
const fileInput = $('file-input');
const uploadMeta = $('upload-meta');
const uploadActions = $('upload-actions');
const uploadProgress = $('upload-progress');
const progressBar = $('progress-bar');
const progressText = $('progress-text');
const inpCaption = $('inp-caption');
const inpCategory = $('inp-category');
const inpPerson = $('inp-person');

// Lightbox
const lightbox = $('lightbox');
const lbImg = $('lb-img');
const lbCaption = $('lb-caption');

// ── Custom Cursor ────────────────────────────────────────
let mouseX = window.innerWidth / 2;
let mouseY = window.innerHeight / 2;
let ringX = mouseX;
let ringY = mouseY;

document.addEventListener('mousemove', e => {
  mouseX = e.clientX;
  mouseY = e.clientY;
  cursorDot.style.left = `${mouseX}px`;
  cursorDot.style.top = `${mouseY}px`;
});

// Smooth follow for the ring
function renderCursor() {
  ringX += (mouseX - ringX) * 0.15;
  ringY += (mouseY - ringY) * 0.15;
  cursorRing.style.left = `${ringX}px`;
  cursorRing.style.top = `${ringY}px`;
  requestAnimationFrame(renderCursor);
}
renderCursor();

// Hover states
const addHover = () => cursorRing.classList.add('hovering');
const removeHover = () => cursorRing.classList.remove('hovering');
document.querySelectorAll('button, input, .editorial-card').forEach(el => {
  el.addEventListener('mouseenter', addHover);
  el.addEventListener('mouseleave', removeHover);
});


// ── LocalStorage helpers ─────────────────────────────────
function loadLocalOverrides() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveLocalOverrides(overrides) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
  } catch(e) { console.warn('localStorage full', e); }
}

// ── Load & Render Masonry ────────────────────────────────
async function load() {
  try {
    const res = await fetch('photos.json');
    const data = await res.json();
    photos = data;

    // Merge localStorage overrides (likes, edits, etc.)
    const overrides = loadLocalOverrides();
    photos.forEach(p => {
      if (overrides[p.id]) {
        Object.assign(p, overrides[p.id]);
      }
    });

    // Filter out locally deleted photos
    const deleted = overrides._deleted || [];
    photos = photos.filter(p => !deleted.includes(p.id));

    applyFilters();
  } catch (err) {
    console.error('Failed to load photos.json', err);
  }
}

function applyFilters() {
  filteredPhotos = photos.filter(p => {
    if (currentPerson && p.person !== currentPerson) return false;
    const matchCat = currentFilter === 'All' || p.category === currentFilter;
    const q = currentSearch.toLowerCase();
    const matchSearch = p.caption.toLowerCase().includes(q) ||
                        (p.person || '').toLowerCase().includes(q) ||
                        (p.category || '').toLowerCase().includes(q) ||
                        (p.sticker || '').toLowerCase().includes(q) ||
                        (p.emotion || '').toLowerCase().includes(q);
    return matchCat && matchSearch;
  });
  render();
  if (typeof renderFilmstrip === 'function') renderFilmstrip();
  if (currentView === 'starmap') initStarMap();
}

function render() {
  // Clear old cards
  grid.innerHTML = '';
  personGalleryGrid.innerHTML = '';
  peopleGrid.innerHTML = '';

  if (filteredPhotos.length === 0 && currentView === 'gallery') {
    grid.appendChild(emptyState);
    emptyState.style.display = 'block';
  } else {
    emptyState.style.display = 'none';
  }

  if (currentView === 'people' && !currentPerson) {
    // Render People Grid
    const peopleMap = {};
    filteredPhotos.forEach(p => {
      const personName = p.person || 'Unknown';
      if (!peopleMap[personName]) {
        peopleMap[personName] = { count: 0, preview: p.filename };
      }
      peopleMap[personName].count++;
    });

    for (const [name, data] of Object.entries(peopleMap)) {
      const el = document.createElement('div');
      el.className = 'person-circle';
      el.innerHTML = `
        <div class="person-avatar">
          <img src="assets/${data.preview}" alt="${esc(name)}" loading="lazy">
        </div>
        <div class="person-info">
          <div class="person-name">${esc(name)}</div>
          <div class="person-count">${data.count} Portrait${data.count > 1 ? 's' : ''}</div>
        </div>
      `;
      el.addEventListener('click', () => openPerson(name));
      el.addEventListener('mouseenter', addHover);
      el.addEventListener('mouseleave', removeHover);
      peopleGrid.appendChild(el);
    }
    return;
  }

  // Render Photo Cards (Gallery or Person Detail)
  const targetGrid = currentPerson ? personGalleryGrid : grid;
  filteredPhotos.forEach((p, i) => {
    const card = document.createElement('div');
    card.className = 'editorial-card';
    card.dataset.index = i;

    card.innerHTML = `
      <div class="card-img-wrap">
        <img src="assets/${p.filename}" alt="${esc(p.caption)}" loading="lazy">
        <div class="card-glare"></div>
      </div>
      <div class="card-info">
        <span class="card-title">${esc(p.caption)}</span>
        <div class="card-meta">
          <span class="card-sticker">${p.sticker || ''}</span>
          <span class="card-likes"><svg viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>${p.likes || 0}</span>
        </div>
      </div>
    `;

    // Re-bind cursor hover since elements are new
    card.addEventListener('mouseenter', addHover);
    card.addEventListener('mouseleave', removeHover);

    // Lightbox open
    card.addEventListener('click', () => openLb(i));

    // 3D Tilt Effect
    card.addEventListener('mousemove', e => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      
      const rotateX = ((y - centerY) / centerY) * -8;
      const rotateY = ((x - centerX) / centerX) * 8;
      
      card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.02, 1.02, 1.02)`;
      
      // Glare follows mouse
      const glare = card.querySelector('.card-glare');
      if (glare) {
        glare.style.background = `radial-gradient(circle at ${x}px ${y}px, rgba(255,255,255,0.3) 0%, transparent 60%)`;
      }
    });

    card.addEventListener('mouseleave', () => {
      card.style.transform = `perspective(1000px) rotateX(0) rotateY(0) scale3d(1, 1, 1)`;
    });

    targetGrid.appendChild(card);
  });

  observeScroll(targetGrid);
}

// ── Scroll Reveal ────────────────────────────────────────
function observeScroll(target) {
  const obs = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) {
        e.target.classList.add('revealed');
        obs.unobserve(e.target);
      }
    });
  }, { threshold: 0.1 });
  
  target.querySelectorAll('.editorial-card:not(.revealed)').forEach(c => obs.observe(c));
}

// ── Search, Filter & View Logic ─────────────────────────
document.querySelectorAll('.view-btn').forEach(btn => {
  btn.addEventListener('click', e => {
    document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    currentView = e.target.dataset.view;
    currentPerson = null;
    
    if (currentView === 'gallery') {
      viewGallery.style.display = 'block';
      viewPeople.style.display = 'none';
      $('view-starmap').style.display = 'none';
      catFilters.style.display = 'flex';
      document.body.style.overflow = '';
    } else if (currentView === 'people') {
      viewGallery.style.display = 'none';
      viewPeople.style.display = 'block';
      $('view-starmap').style.display = 'none';
      catFilters.style.display = 'none';
      peopleGrid.style.display = 'grid';
      personDetailView.style.display = 'none';
      document.body.style.overflow = '';
    } else if (currentView === 'starmap') {
      viewGallery.style.display = 'none';
      viewPeople.style.display = 'none';
      $('view-starmap').style.display = 'flex';
      catFilters.style.display = 'none';
      document.body.style.overflow = 'hidden';
    }
    applyFilters();
  });
});

function openPerson(name) {
  currentPerson = name;
  $('person-title').textContent = name;
  peopleGrid.style.display = 'none';
  personDetailView.style.display = 'block';
  applyFilters();
}

$('btn-back-people').addEventListener('click', () => {
  currentPerson = null;
  personDetailView.style.display = 'none';
  peopleGrid.style.display = 'grid';
  applyFilters();
});

document.querySelectorAll('.cat-pill').forEach(btn => {
  btn.addEventListener('click', e => {
    document.querySelectorAll('.cat-pill').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    currentFilter = e.target.dataset.cat;
    applyFilters();
  });
});

function openSearch() {
  paletteOverlay.classList.add('active');
  paletteInput.value = currentSearch;
  paletteInput.focus();
}

function closeSearch() {
  paletteOverlay.classList.remove('active');
  paletteInput.blur();
}

btnSearch.addEventListener('click', openSearch);
paletteOverlay.addEventListener('click', e => {
  if (e.target === paletteOverlay) closeSearch();
});

paletteInput.addEventListener('input', e => {
  currentSearch = e.target.value;
  applyFilters();
});

document.addEventListener('keydown', e => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault();
    paletteOverlay.classList.contains('active') ? closeSearch() : openSearch();
  }
  if (e.key === 'Escape' && paletteOverlay.classList.contains('active')) {
    closeSearch();
  }
});

function esc(str) { 
  const d = document.createElement('div'); 
  d.textContent = str; 
  return d.innerHTML; 
}


// ── Spatial Upload Modal ─────────────────────────────────
$('btn-upload').addEventListener('click', () => {
  resetUpload();
  uploadOverlay.classList.add('active');
  document.body.style.overflow = 'hidden';
});

$('upload-close').addEventListener('click', () => {
  uploadOverlay.classList.remove('active');
  document.body.style.overflow = '';
});

const batchList = $('upload-batch-list');

function resetUpload() {
  pickedFiles = [];
  uploadPreview.innerHTML = '';
  dropContent.style.display = 'block';
  if(batchList) batchList.innerHTML = '';
  uploadMeta.style.display = 'none';
  uploadActions.style.display = 'none';
  uploadProgress.style.display = 'none';
  progressBar.style.width = '0%';
}

// Drag & Drop
dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('drag-over'); });
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'));
dropzone.addEventListener('drop', e => {
  e.preventDefault(); dropzone.classList.remove('drag-over');
  handleFiles(e.dataTransfer.files);
});
dropzone.addEventListener('click', () => { if (!pickedFiles.length) fileInput.click(); });
fileInput.addEventListener('change', e => handleFiles(e.target.files));

function handleFiles(files) {
  if (!files || !files.length) return;
  pickedFiles = Array.from(files).filter(f => f.type.startsWith('image/'));
  if (!pickedFiles.length) return;

  dropContent.style.display = 'none';
  uploadPreview.innerHTML = '';
  if(batchList) batchList.innerHTML = '';

  pickedFiles.forEach(f => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = document.createElement('img');
      img.src = e.target.result;
      uploadPreview.appendChild(img);

      if(batchList) {
        const item = document.createElement('div');
        item.className = 'batch-item';
        item.innerHTML = `
          <img src="${e.target.result}" class="batch-item-img">
          <div class="batch-item-inputs">
            <input type="text" class="full-width b-caption" placeholder="Title" value="${f.name.split('.')[0]}">
            <select class="b-cat">
              <option value="Portrait">Portrait</option>
              <option value="Lifestyle">Lifestyle</option>
              <option value="Creative">Creative</option>
            </select>
            <input type="text" class="b-person" placeholder="Person Name">
            <input type="text" class="b-emotion" placeholder="Tags / Emotion">
            <input type="text" class="b-sticker" placeholder="Emoji Sticker">
          </div>
        `;
        batchList.appendChild(item);
      }
    };
    reader.readAsDataURL(f);
  });

  uploadMeta.style.display = 'block';
  uploadActions.style.display = 'block';
}

$('btn-submit').addEventListener('click', async () => {
  if (!pickedFiles.length) return;
  alert('Upload is not available in the hosted version. Please add photos via GitHub.');
});


// ── Cinematic Lightbox ───────────────────────────────────
const filmstripTrack = $('filmstrip-track');
const lbFilmstrip = $('lb-filmstrip');
const btnPlay = $('lb-play');
let slideshowInterval = null;
let isZoomed = false;

// Drawer
const detailDrawer = $('lb-detail-drawer');
const editCaption = $('edit-caption');
const editCategory = $('edit-category');
const editPerson = $('edit-person');
const editEmotion = $('edit-emotion');
const editState = $('edit-state');
const editFavorite = $('edit-favorite');

if ($('lb-info')) $('lb-info').addEventListener('click', () => detailDrawer.classList.toggle('active'));
if ($('drawer-close')) $('drawer-close').addEventListener('click', () => detailDrawer.classList.remove('active'));

function populateDrawer(p) {
  if (!p) return;
  if(editCaption) editCaption.value = p.caption || '';
  if(editCategory) editCategory.value = p.category || 'Portrait';
  if(editPerson) editPerson.value = p.person || '';
  if(editEmotion) editEmotion.value = p.emotion || '';
  if(editState) editState.value = p.state || 'published';
  if(editFavorite) editFavorite.checked = !!p.favorite;
}

[editCaption, editCategory, editPerson, editEmotion, editState, editFavorite].forEach(el => {
  if (el) el.addEventListener('change', () => {
    const p = filteredPhotos[currentLb];
    if (p) {
      const updates = {
        caption: editCaption.value, category: editCategory.value,
        person: editPerson.value, emotion: editEmotion.value,
        state: editState.value, favorite: editFavorite.checked
      };
      updatePhoto(p.id, updates);
      lbCaption.textContent = updates.caption;
    }
  });
});

function renderFilmstrip() {
  if (!filmstripTrack) return;
  filmstripTrack.innerHTML = '';
  filteredPhotos.forEach((p, idx) => {
    const img = document.createElement('img');
    img.src = `assets/${p.filename}`;
    img.className = 'filmstrip-thumb';
    img.addEventListener('click', () => {
      if (idx !== currentLb) switchTo(idx, idx > currentLb ? 1 : -1);
    });
    img.addEventListener('mouseenter', addHover);
    img.addEventListener('mouseleave', removeHover);
    filmstripTrack.appendChild(img);
  });
}

function openLb(i) {
  currentLb = i;
  const p = filteredPhotos[i];
  lbImg.src = `assets/${p.filename}`;
  lbCaption.textContent = p.caption;
  $('lb-delete').dataset.id = p.id;
  
  populateDrawer(p);
  
  // Reset zoom and transition
  isZoomed = false;
  lbImg.classList.remove('zoomed');
  lbImg.style.transformOrigin = 'center center';
  lbImg.style.transition = '';
  lbImg.style.transform = '';
  lbImg.style.opacity = '';
  isAnimatingSwitch = false;
  
  // Sync filmstrip
  if (filmstripTrack) {
    const thumbs = filmstripTrack.querySelectorAll('.filmstrip-thumb');
    thumbs.forEach(t => t.classList.remove('active'));
    if (thumbs[i]) {
      thumbs[i].classList.add('active');
      const thumbRect = thumbs[i].getBoundingClientRect();
      const stripRect = lbFilmstrip.getBoundingClientRect();
      if (thumbRect.left < stripRect.left || thumbRect.right > stripRect.right) {
        thumbs[i].scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }
  }
  
  lightbox.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeLb() {
  lightbox.classList.remove('active');
  document.body.style.overflow = currentView === 'starmap' ? 'hidden' : '';
  if (slideshowInterval) toggleSlideshow();
  isDirectorMode = false;
  setTimeout(() => { if(!lightbox.classList.contains('active')) lbImg.src = ''; }, 400);
}

function toggleSlideshow() {
  if (slideshowInterval) {
    clearInterval(slideshowInterval);
    slideshowInterval = null;
    btnPlay.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;
    btnPlay.classList.remove('active');
  } else {
    navLb(1);
    slideshowInterval = setInterval(() => navLb(1), 3500);
    btnPlay.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>`;
    btnPlay.classList.add('active');
  }
}
if (btnPlay) btnPlay.addEventListener('click', toggleSlideshow);

const lbImageContainer = $('lb-image-container');
let dragStartX = 0;
let dragCurrentX = 0;
let isDraggingLb = false;
let dragStartTime = 0;

lbImageContainer.addEventListener('mousedown', startLbDrag);
lbImageContainer.addEventListener('touchstart', startLbDrag, {passive: true});

window.addEventListener('mousemove', moveLbDrag);
window.addEventListener('touchmove', moveLbDrag, {passive: false});

window.addEventListener('mouseup', endLbDrag);
window.addEventListener('touchend', endLbDrag);

function startLbDrag(e) {
  if (isZoomed || isAnimatingSwitch || !lightbox.classList.contains('active')) return;
  if (e.target.closest('button') || e.target.closest('.lb-toolbar') || e.target.closest('.lb-filmstrip')) return;
  
  isDraggingLb = true;
  dragStartX = e.type.includes('mouse') ? e.clientX : e.touches[0].clientX;
  dragCurrentX = dragStartX;
  dragStartTime = Date.now();
  
  lbImg.style.transition = 'none';
}

function moveLbDrag(e) {
  if (!isDraggingLb) return;
  dragCurrentX = e.type.includes('mouse') ? e.clientX : e.touches[0].clientX;
  const diffX = dragCurrentX - dragStartX;
  
  const rotateY = diffX * 0.05; 
  lbImg.style.transform = `scale(0.95) translate3d(${diffX}px, 0, 0) rotateY(${rotateY}deg)`;
  
  if (e.cancelable) e.preventDefault();
}

function endLbDrag(e) {
  if (!isDraggingLb) return;
  isDraggingLb = false;
  
  const diffX = dragCurrentX - dragStartX;
  const timeDiff = Date.now() - dragStartTime;
  const velocity = Math.abs(diffX) / timeDiff;
  const threshold = window.innerWidth * 0.15;
  
  if (Math.abs(diffX) < 5 && timeDiff < 300) {
    lbImg.style.transform = '';
    lbImg.style.transition = '';
    return; // Was a click, handled by lbImg click listener
  }

  if (Math.abs(diffX) > threshold || velocity > 0.5) {
    const dir = diffX > 0 ? -1 : 1;
    lbImg.style.transition = 'transform 0.4s var(--ease-out), opacity 0.4s';
    const outX = diffX > 0 ? window.innerWidth : -window.innerWidth;
    lbImg.style.transform = `scale(0.9) translate3d(${outX}px, 0, 0) rotateY(${diffX > 0 ? 30 : -30}deg)`;
    lbImg.style.opacity = '0';
    
    isAnimatingSwitch = true;
    setTimeout(() => {
      isAnimatingSwitch = false;
      const nextIdx = (currentLb + dir + filteredPhotos.length) % filteredPhotos.length;
      switchTo(nextIdx, dir, true);
    }, 300);
  } else {
    lbImg.style.transition = 'transform 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
    lbImg.style.transform = 'scale(1) translate3d(0, 0, 0) rotateY(0)';
    setTimeout(() => {
      if (!isDraggingLb) {
        lbImg.style.transition = '';
        lbImg.style.transform = '';
      }
    }, 500);
  }
}

lbImg.addEventListener('click', e => {
  if (Math.abs(dragCurrentX - dragStartX) > 5) return;
  isZoomed = !isZoomed;
  if (isZoomed) {
    lbImg.classList.add('zoomed');
    panImage(e);
  } else {
    lbImg.classList.remove('zoomed');
    lbImg.style.transformOrigin = 'center center';
  }
});

window.addEventListener('mousemove', e => {
  if (isZoomed) panImage(e);
});

function panImage(e) {
  const x = (e.clientX / window.innerWidth) * 100;
  const y = (e.clientY / window.innerHeight) * 100;
  lbImg.style.transformOrigin = `${x}% ${y}%`;
}

$('lb-close').addEventListener('click', closeLb);
$('lb-prev').addEventListener('click', () => navLb(-1));
$('lb-next').addEventListener('click', () => navLb(1));

let isAnimatingSwitch = false;

async function switchTo(index, dir, skipOut = false) {
  if (isAnimatingSwitch || index === currentLb) return;
  isAnimatingSwitch = true;
  
  isZoomed = false;
  lbImg.classList.remove('zoomed');
  lbImg.style.transformOrigin = 'center center';
  
  const outX = dir === 1 ? -50 : 50; 
  
  if (!skipOut) {
    lbImg.style.transition = 'transform 0.3s cubic-bezier(0.3, 0, 0.8, 0.15), opacity 0.3s';
    lbImg.style.transform = `scale(0.85) translate3d(${outX}vw, 0, -100px) rotateY(${dir === 1 ? -15 : 15}deg)`;
    lbImg.style.opacity = '0';
    await new Promise(r => setTimeout(r, 300));
  }
  
  currentLb = index;
  const p = filteredPhotos[currentLb];
  lbImg.src = `assets/${p.filename}`;
  lbCaption.textContent = p.caption;
  $('lb-delete').dataset.id = p.id;
  populateDrawer(p);
  
  if (filmstripTrack) {
    const thumbs = filmstripTrack.querySelectorAll('.filmstrip-thumb');
    thumbs.forEach(t => t.classList.remove('active'));
    if (thumbs[index]) {
      thumbs[index].classList.add('active');
      const thumbRect = thumbs[index].getBoundingClientRect();
      const stripRect = lbFilmstrip.getBoundingClientRect();
      if (thumbRect.left < stripRect.left || thumbRect.right > stripRect.right) {
        thumbs[index].scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }
  }
  
  lbImg.style.transition = 'none';
  lbImg.style.transform = `scale(0.85) translate3d(${-outX}vw, 0, -100px) rotateY(${dir === 1 ? 15 : -15}deg)`;
  
  void lbImg.offsetWidth;
  
  lbImg.style.transition = 'transform 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.6s';
  lbImg.style.transform = 'scale(1) translate3d(0, 0, 0) rotateY(0)';
  lbImg.style.opacity = '1';
  
  setTimeout(() => {
    lbImg.style.transition = '';
    lbImg.style.transform = '';
    lbImg.style.opacity = '';
    isAnimatingSwitch = false;
  }, 600);
}

function navLb(dir) {
  if(!filteredPhotos.length) return;
  const nextIdx = (currentLb + dir + filteredPhotos.length) % filteredPhotos.length;
  switchTo(nextIdx, dir);
}

document.addEventListener('keydown', e => {
  if (!lightbox.classList.contains('active')) return;
  if (e.key === 'Escape') closeLb();
  if (e.key === 'ArrowLeft') navLb(-1);
  if (e.key === 'ArrowRight') navLb(1);
  if (e.key === ' ') {
    e.preventDefault();
    toggleSlideshow();
  }
  if (['1','2','3','4'].includes(e.key)) {
    const idx = parseInt(e.key) - 1;
    const btns = document.querySelectorAll('.reaction-btn');
    if (btns[idx]) {
       const emojiStr = btns[idx].dataset.emoji;
       spawnEmoji(emojiStr);
       btns[idx].style.transform = 'scale(1.5)';
       setTimeout(() => btns[idx].style.transform = '', 200);
       
       const p = filteredPhotos[currentLb];
       if (p) {
         p.likes = (p.likes || 0) + 1;
         p.sticker = emojiStr;
         updatePhoto(p.id, { likes: p.likes, sticker: p.sticker });
       }
    }
  }
});

// ── Client-Side Updates (localStorage) ──────────────────
function updatePhoto(id, updates) {
  const p = photos.find(x => x.id === id);
  if (p) Object.assign(p, updates);

  // Save override to localStorage
  const overrides = loadLocalOverrides();
  overrides[id] = overrides[id] || {};
  Object.assign(overrides[id], updates);
  saveLocalOverrides(overrides);

  // Update DOM
  const card = document.querySelector(`.editorial-card[data-index="${currentLb}"]`);
  if (card) {
    const title = card.querySelector('.card-title');
    if (title) title.textContent = p.caption || '';
    const lk = card.querySelector('.card-likes');
    if (lk) lk.innerHTML = `<svg viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>${p.likes || 0}`;
    const st = card.querySelector('.card-sticker');
    if (st) st.textContent = p.sticker || '';
  }
}

document.querySelectorAll('.reaction-btn').forEach((btn) => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const emojiStr = btn.dataset.emoji;
    spawnEmoji(emojiStr, e.clientX, e.clientY);
    const p = filteredPhotos[currentLb];
    if (p) {
      p.likes = (p.likes || 0) + 1;
      p.sticker = emojiStr;
      updatePhoto(p.id, { likes: p.likes, sticker: p.sticker });
    }
  });
});

if ($('lb-like')) {
  $('lb-like').addEventListener('click', (e) => {
    const p = filteredPhotos[currentLb];
    if (p) {
      p.likes = (p.likes || 0) + 1;
      updatePhoto(p.id, { likes: p.likes });
      $('lb-like').classList.add('liked');
      spawnEmoji('❤️', e.clientX, e.clientY);
      setTimeout(() => $('lb-like').classList.remove('liked'), 300);
    }
  });
}

function spawnEmoji(emojiStr, startX, startY) {
  if (!startX || !startY) {
    startX = window.innerWidth / 2;
    startY = window.innerHeight / 2;
  }
  
  const count = Math.floor(Math.random() * 4) + 4; // 4 to 7 emojis per burst
  for (let i = 0; i < count; i++) {
    const el = document.createElement('div');
    el.className = 'floating-emoji';
    el.textContent = emojiStr;
    el.style.left = `${startX}px`;
    el.style.top = `${startY}px`;
    
    const angle = Math.random() * Math.PI * 2;
    const velocity = 150 + Math.random() * 350; 
    const dx = Math.cos(angle) * velocity;
    const dy = Math.sin(angle) * velocity - 100;
    
    el.style.setProperty('--dx', `${dx}px`);
    el.style.setProperty('--dy', `${dy}px`);
    el.style.setProperty('--rot-start', `${(Math.random() - 0.5) * 60}deg`);
    el.style.setProperty('--rot-end', `${(Math.random() - 0.5) * 360}deg`);
    
    lightbox.appendChild(el);
    setTimeout(() => el.remove(), 1500);
  }
}

$('lb-delete').addEventListener('click', async () => {
  const id = $('lb-delete').dataset.id;
  if (!confirm('Are you sure you want to hide this portrait?')) return;
  
  // Mark as deleted in localStorage
  const overrides = loadLocalOverrides();
  overrides._deleted = overrides._deleted || [];
  overrides._deleted.push(id);
  saveLocalOverrides(overrides);
  
  photos = photos.filter(p => p.id !== id);
  closeLb();
  applyFilters();
});


// ── Director Mode ──────────────────────────────────────────
let isDirectorMode = false;

$('btn-director').addEventListener('click', () => {
  if (filteredPhotos.length === 0) return;
  isDirectorMode = true;
  
  // Start lightbox with cinematic feels
  lightbox.classList.add('cinematic');
  openLb(0);
  
  if (slideshowInterval) clearInterval(slideshowInterval);
  const btnPlay = $('lb-play');
  if (btnPlay) {
    btnPlay.classList.add('active');
    btnPlay.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>`;
  }
  
  // Cinematic auto-play
  lbImg.style.transition = 'transform 4s linear, opacity 1s';
  lbImg.style.transform = 'scale(1.1)';
  
  slideshowInterval = setInterval(() => {
    if (!isDirectorMode) {
       clearInterval(slideshowInterval);
       slideshowInterval = null;
       if (btnPlay) {
         btnPlay.classList.remove('active');
         btnPlay.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;
       }
       return;
    }
    navLb(1);
    setTimeout(() => {
      lbImg.style.transition = 'none';
      lbImg.style.transform = 'scale(1)';
      void lbImg.offsetWidth;
      lbImg.style.transition = 'transform 4s linear, opacity 1s';
      lbImg.style.transform = 'scale(1.1)';
    }, 600);
  }, 4000);
});

// ── Star Map View ──────────────────────────────────────────
let starmapAnim;
const canvas = $('starmap-canvas');
const ctx = canvas ? canvas.getContext('2d') : null;

function initStarMap() {
  if (!canvas || currentView !== 'starmap') return;
  
  cancelAnimationFrame(starmapAnim);
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  
  const nodes = filteredPhotos.map(p => ({
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height,
    vx: 0, vy: 0,
    photo: p,
    radius: 40 + (p.likes || 0) * 4,
    img: new Image()
  }));
  nodes.forEach(n => n.img.src = `assets/${n.photo.filename}`);
  
  const links = [];
  for(let i=0; i<nodes.length; i++) {
    for(let j=i+1; j<nodes.length; j++) {
      let weight = 0;
      if (nodes[i].photo.person === nodes[j].photo.person && nodes[i].photo.person !== 'Unknown') weight += 3;
      if (nodes[i].photo.category === nodes[j].photo.category) weight += 1;
      if (weight > 0) links.push({ s: nodes[i], t: nodes[j], w: weight });
    }
  }
  
  // Mouse interaction
  let mx = -1000, my = -1000, isMouseDown = false, draggedNode = null, clickTime = 0;
  canvas.onmousemove = e => { 
    mx = e.clientX; my = e.clientY; 
    if (draggedNode) {
      draggedNode.x = mx; draggedNode.y = my; draggedNode.vx = 0; draggedNode.vy = 0;
    }
  };
  canvas.onmousedown = e => { 
    isMouseDown = true;
    clickTime = Date.now();
    for(let i=nodes.length-1; i>=0; i--) {
      const dx = e.clientX - nodes[i].x;
      const dy = e.clientY - nodes[i].y;
      if (dx*dx + dy*dy <= nodes[i].radius*nodes[i].radius) {
        draggedNode = nodes[i];
        break;
      }
    }
  };
  canvas.onmouseup = e => { 
    isMouseDown = false; 
    if (draggedNode && (Date.now() - clickTime < 250)) {
       // Click detected
       const idx = filteredPhotos.findIndex(p => p.id === draggedNode.photo.id);
       if (idx > -1) { openLb(idx); }
    }
    draggedNode = null;
  };
  canvas.onmouseleave = () => { isMouseDown = false; mx = -1000; my = -1000; draggedNode = null; };
  
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const cx = canvas.width/2;
    const cy = canvas.height/2;
    
    for(let i=0; i<nodes.length; i++) {
       const n1 = nodes[i];
       if (n1 !== draggedNode) {
         // Gravity to center
         n1.vx += (cx - n1.x) * 0.0001;
         n1.vy += (cy - n1.y) * 0.0001;
         
         // Mouse repulsion (only if not dragging)
         if (mx > -1000 && !draggedNode) {
           const dx = mx - n1.x;
           const dy = my - n1.y;
           const dist = Math.sqrt(dx*dx + dy*dy) || 1;
           if (dist < 200) {
              const f = (200 - dist) * 0.002 * (isMouseDown ? 1 : -1);
              n1.vx += (dx/dist) * f;
              n1.vy += (dy/dist) * f;
           }
         }
       }
       
       for(let j=i+1; j<nodes.length; j++) {
          const n2 = nodes[j];
          const dx = n2.x - n1.x;
          const dy = n2.y - n1.y;
          const dist = Math.sqrt(dx*dx + dy*dy) || 1;
          const minDist = n1.radius + n2.radius + 40;
          if (dist < minDist) {
            const f = (minDist - dist) * 0.015;
            if (n1 !== draggedNode) { n1.vx -= (dx/dist) * f; n1.vy -= (dy/dist) * f; }
            if (n2 !== draggedNode) { n2.vx += (dx/dist) * f; n2.vy += (dy/dist) * f; }
          }
       }
    }
    
    // Attraction
    links.forEach(l => {
       const dx = l.t.x - l.s.x;
       const dy = l.t.y - l.s.y;
       const dist = Math.sqrt(dx*dx + dy*dy) || 1;
       const targetDist = l.s.radius + l.t.radius + 100;
       const f = (dist - targetDist) * 0.0005 * l.w;
       if (l.s !== draggedNode) { l.s.vx += (dx/dist) * f; l.s.vy += (dy/dist) * f; }
       if (l.t !== draggedNode) { l.t.vx -= (dx/dist) * f; l.t.vy -= (dy/dist) * f; }
       
       ctx.save();
       ctx.beginPath();
       ctx.moveTo(l.s.x, l.s.y);
       ctx.lineTo(l.t.x, l.t.y);
       
       ctx.shadowColor = l.w > 2 ? 'rgba(10, 132, 255, 0.8)' : 'rgba(255, 255, 255, 0.5)';
       ctx.shadowBlur = 15;
       
       const lineGrad = ctx.createLinearGradient(l.s.x, l.s.y, l.t.x, l.t.y);
       lineGrad.addColorStop(0, l.w > 2 ? 'rgba(10, 132, 255, 0.1)' : 'rgba(255, 255, 255, 0.0)');
       lineGrad.addColorStop(0.5, l.w > 2 ? 'rgba(10, 132, 255, 0.8)' : 'rgba(255, 255, 255, 0.4)');
       lineGrad.addColorStop(1, l.w > 2 ? 'rgba(10, 132, 255, 0.1)' : 'rgba(255, 255, 255, 0.0)');
       
       ctx.strokeStyle = lineGrad;
       ctx.lineWidth = l.w + 1;
       ctx.stroke();
       ctx.restore();
    });
    
    nodes.forEach(n => {
       if (n !== draggedNode) {
         n.vx *= 0.85;
         n.vy *= 0.85;
         n.x += n.vx;
         n.y += n.vy;
         
         // Constrain to bounds
         if(n.x < n.radius) { n.x = n.radius; n.vx *= -1; }
         if(n.x > canvas.width - n.radius) { n.x = canvas.width - n.radius; n.vx *= -1; }
         if(n.y < n.radius) { n.y = n.radius; n.vy *= -1; }
         if(n.y > canvas.height - n.radius) { n.y = canvas.height - n.radius; n.vy *= -1; }
       }
       
       const currentRadius = n === draggedNode ? n.radius * 1.1 : n.radius;
       
       // 1. Drop shadow
       ctx.save();
       ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
       ctx.shadowBlur = n === draggedNode ? 30 : 15;
       ctx.shadowOffsetY = n === draggedNode ? 15 : 8;
       ctx.beginPath();
       ctx.arc(n.x, n.y, currentRadius, 0, Math.PI*2);
       ctx.fillStyle = 'rgba(20,20,25,0.8)';
       ctx.fill();
       ctx.restore();
       
       // 2. Image
       ctx.save();
       ctx.beginPath();
       ctx.arc(n.x, n.y, currentRadius, 0, Math.PI*2);
       ctx.clip();
       if (n.img.complete && n.img.naturalWidth > 0) {
         ctx.drawImage(n.img, n.x - currentRadius, n.y - currentRadius, currentRadius*2, currentRadius*2);
       } else {
         ctx.fillStyle = '#222';
         ctx.fill();
       }
       ctx.restore();
       
       // 3. Liquid Glass highlight
       ctx.save();
       ctx.beginPath();
       ctx.arc(n.x, n.y, currentRadius, 0, Math.PI*2);
       const grad = ctx.createRadialGradient(n.x - currentRadius*0.3, n.y - currentRadius*0.3, currentRadius*0.1, n.x, n.y, currentRadius);
       grad.addColorStop(0, 'rgba(255, 255, 255, 0.6)');
       grad.addColorStop(0.3, 'rgba(255, 255, 255, 0.0)');
       grad.addColorStop(0.8, 'rgba(0, 0, 0, 0.2)');
       grad.addColorStop(1, 'rgba(255, 255, 255, 0.7)');
       ctx.fillStyle = grad;
       ctx.fill();
       
       ctx.lineWidth = n === draggedNode ? 3 : 1.5;
       ctx.strokeStyle = n === draggedNode ? 'rgba(255,255,255,1)' : 'rgba(255,255,255,0.3)';
       ctx.stroke();
       ctx.restore();
       
       if (n.photo.person && n.photo.person !== 'Unknown') {
          ctx.font = "14px 'SF Pro Display', sans-serif";
          ctx.fillStyle = "rgba(255,255,255,0.9)";
          ctx.textAlign = "center";
          ctx.fillText(n.photo.person, n.x, n.y + currentRadius + 20);
       }
       
       if (n.photo.sticker) {
          ctx.font = "24px sans-serif";
          ctx.fillText(n.photo.sticker, n.x + currentRadius - 12, n.y - currentRadius + 12);
       }
    });
    
    starmapAnim = requestAnimationFrame(draw);
  }
  draw();
}

window.addEventListener('resize', () => {
   if (currentView === 'starmap') initStarMap();
});

// ── Start ────────────────────────────────────────────────
load();
