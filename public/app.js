// フォームの表示制御：種別が「バグ」のときだけ再現手順などを表示・必須にする
(function () {
  const form = document.getElementById('request-form');
  if (!form) return;
  const bugFields = document.getElementById('bug-fields');
  const bugInputs = bugFields.querySelectorAll('textarea');
  const radios = form.querySelectorAll('input[name="kind"]');
  const submitBtn = document.getElementById('submit-btn');

  function update() {
    const kind = form.querySelector('input[name="kind"]:checked');
    const isBug = kind && kind.value === 'bug';
    bugFields.classList.toggle('hidden', !isBug);
    bugInputs.forEach((el) => { el.required = isBug; });
  }
  radios.forEach((r) => r.addEventListener('change', update));
  update();

  // 上限超過なら送信を止める（サーバー側でも同じ判定をする）
  form.addEventListener('submit', (e) => {
    if (form.dataset.blocked === '1') {
      e.preventDefault();
      return;
    }
    submitBtn.disabled = true;
    submitBtn.textContent = '送信中…';
  });
})();
