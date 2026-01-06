document.getElementById("cvForm").addEventListener("submit", function(e) {
  e.preventDefault();
  alert("Your CV has been generated! (PDF download coming soon)");
});



// MULTI-CATEGORY FILTER + SEARCH
const searchInput = document.getElementById('jobSearch');
const categoryCheckboxes = document.querySelectorAll('.categoryFilter');
const cards = document.querySelectorAll('.card');

function filterJobsMulti() {
  const keyword = searchInput.value.toLowerCase();
  const selectedCategories = Array.from(categoryCheckboxes)
                                  .filter(cb => cb.checked)
                                  .map(cb => cb.value);

  cards.forEach(card => {
    const text = card.innerText.toLowerCase();
    const category = card.getAttribute('data-category');

    if ((text.includes(keyword) || keyword === '') &&
        selectedCategories.includes(category)) {
      card.style.display = 'block';
    } else {
      card.style.display = 'none';
    }
  });
}

// Event listeners
searchInput.addEventListener('input', filterJobsMulti);
categoryCheckboxes.forEach(cb => cb.addEventListener('change', filterJobsMulti));

