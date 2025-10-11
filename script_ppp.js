document.querySelectorAll('nav button').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('nav button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    const section = btn.dataset.section;
    document.querySelectorAll('main section').forEach(sec => {
      sec.classList.remove('visible');
    });
    document.getElementById(section).classList.add('visible');

    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
});
