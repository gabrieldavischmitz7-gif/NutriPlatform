function showFeedback(element, message, type) {
  if (!element) {
    return;
  }

  element.textContent = message;
  element.className = "feedback " + type;
}

function clearFieldErrors(fields) {
  fields.forEach((field) => {
    const error = document.getElementById(field + "Error");
    if (error) {
      error.textContent = "";
    }
  });
}

function requireFields(fields) {
  let isValid = true;

  fields.forEach((field) => {
    const input = document.getElementById(field.id);
    const error = document.getElementById(field.id + "Error");

    if (!input.value.trim()) {
      error.textContent = field.label + " é obrigatório.";
      isValid = false;
    }
  });

  return isValid;
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getAdminSession() {
  return JSON.parse(sessionStorage.getItem("admin") || "null");
}

function getNutritionistSession() {
  return JSON.parse(sessionStorage.getItem("nutritionist") || "null");
}

function openAdminActionModal(options) {
  return new Promise((resolve) => {
    const modal = document.getElementById("adminActionModal");
    const title = document.getElementById("modalTitle");
    const description = document.getElementById("modalDescription");
    const text = document.getElementById("modalText");
    const error = document.getElementById("modalTextError");
    const cancelButton = document.getElementById("modalCancelButton");
    const confirmButton = document.getElementById("modalConfirmButton");

    title.textContent = options.title;
    description.textContent = options.description;
    text.value = options.defaultValue || "";
    text.placeholder = options.placeholder || "";
    error.textContent = "";
    modal.classList.remove("is-hidden");
    text.focus();
    text.select();

    function close(value) {
      modal.classList.add("is-hidden");
      cancelButton.removeEventListener("click", handleCancel);
      confirmButton.removeEventListener("click", handleConfirm);
      modal.removeEventListener("click", handleBackdropClick);
      document.removeEventListener("keydown", handleKeydown);
      resolve(value);
    }

    function handleCancel() {
      close(null);
    }

    function handleConfirm() {
      const value = text.value.trim();

      if (!value) {
        error.textContent = "Escreva uma observação antes de confirmar.";
        text.focus();
        return;
      }

      close(value);
    }

    function handleBackdropClick(event) {
      if (event.target === modal) {
        close(null);
      }
    }

    function handleKeydown(event) {
      if (event.key === "Escape") {
        close(null);
      }
    }

    cancelButton.addEventListener("click", handleCancel);
    confirmButton.addEventListener("click", handleConfirm);
    modal.addEventListener("click", handleBackdropClick);
    document.addEventListener("keydown", handleKeydown);
  });
}

function openGenericModal(title, message) {
  const modal = document.getElementById("genericModal");
  if (!modal) return;

  const modalTitle = document.getElementById("genericModalTitle");
  const modalContent = document.getElementById("genericModalContent");
  const closeButton = document.getElementById("genericModalClose");

  if (modalTitle) modalTitle.textContent = title;
  if (modalContent) modalContent.innerHTML = `<p>${escapeHtml(message)}</p>`;
  modal.classList.remove("is-hidden");

  function closeModal() {
    modal.classList.add("is-hidden");
    closeButton.removeEventListener("click", closeModal);
    modal.removeEventListener("click", handleBackdrop);
  }

  function handleBackdrop(event) {
    if (event.target === modal) {
      closeModal();
    }
  }

  closeButton.addEventListener("click", closeModal);
  modal.addEventListener("click", handleBackdrop);
}

async function sendJson(url, data, options = {}) {
  const headers = {
    "Content-Type": "application/json"
  };

  if (options.adminKey) {
    headers["X-Admin-Key"] = options.adminKey;
  }

  let response;

  try {
    response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(data)
    });
  } catch (networkError) {
    throw new Error(
      "Não foi possível conectar ao servidor. Verifique se o server.py está rodando e se " +
      "você está acessando pelo endereço http://127.0.0.1:8000 (e não abrindo o arquivo .html diretamente)."
    );
  }

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.message || "Não foi possível concluir a ação.");
  }

  return payload;
}

async function getJson(url, options = {}) {
  const headers = {};

  if (options.adminKey) {
    headers["X-Admin-Key"] = options.adminKey;
  }

  let response;

  try {
    response = await fetch(url, { headers });
  } catch (networkError) {
    throw new Error(
      "Não foi possível conectar ao servidor. Verifique se o server.py está rodando e se " +
      "você está acessando pelo endereço http://127.0.0.1:8000 (e não abrindo o arquivo .html diretamente)."
    );
  }

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.message || "Não foi possível carregar os dados.");
  }

  return payload;
}

function setupPasswordToggle() {
  const button = document.getElementById("togglePassword");
  const input = document.getElementById("password");

  if (!button || !input) {
    return;
  }

  button.addEventListener("click", () => {
    const shouldShow = input.type === "password";
    input.type = shouldShow ? "text" : "password";
    button.textContent = shouldShow ? "Ocultar" : "Mostrar";
  });
}

function setupRegisterForm() {
  const form = document.getElementById("registerForm");
  const feedback = document.getElementById("feedback");

  if (!form) {
    return;
  }

  const fields = [
    { id: "name", label: "Nome completo" },
    { id: "cpf", label: "CPF" },
    { id: "birthDate", label: "Data de nascimento" },
    { id: "crn", label: "CRN" },
    { id: "crnRegion", label: "Região do CRN" },
    { id: "email", label: "E-mail" },
    { id: "password", label: "Senha" }
  ];

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearFieldErrors(fields.map((field) => field.id));
    feedback.className = "feedback";
    feedback.textContent = "";

    if (!requireFields(fields)) {
      showFeedback(feedback, "Preencha todos os campos obrigatórios para continuar.", "error");
      return;
    }

    const data = {
      name: document.getElementById("name").value.trim(),
      cpf: document.getElementById("cpf").value.trim(),
      birthDate: document.getElementById("birthDate").value,
      crn: document.getElementById("crn").value.trim(),
      crnRegion: document.getElementById("crnRegion").value,
      email: document.getElementById("email").value.trim(),
      password: document.getElementById("password").value
    };

    try {
      const payload = await sendJson("/api/register", data);
      form.reset();
      showFeedback(feedback, payload.message, "success");
    } catch (error) {
      showFeedback(feedback, error.message, "error");
    }
  });
}

function setupLoginForm() {
  const form = document.getElementById("loginForm");
  const feedback = document.getElementById("loginFeedback");

  if (!form) {
    return;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearFieldErrors(["loginCrn", "loginPassword"]);
    feedback.className = "feedback";
    feedback.textContent = "";

    const crn = document.getElementById("loginCrn").value.trim();
    const password = document.getElementById("loginPassword").value;

    if (!crn || !password) {
      if (!crn) {
        document.getElementById("loginCrnError").textContent = "CRN é obrigatório.";
      }

      if (!password) {
        document.getElementById("loginPasswordError").textContent = "Senha é obrigatória.";
      }

      showFeedback(feedback, "Preencha CRN e senha para entrar.", "error");
      return;
    }

    try {
      const payload = await sendJson("/api/login", { crn, password });
      sessionStorage.setItem("nutritionist", JSON.stringify(payload.nutritionist));
      window.location.href = "dashboard.html";
    } catch (error) {
      showFeedback(feedback, error.message, "error");
    }
  });
}

function setupAdminLogin() {
  const form = document.getElementById("adminLoginForm");

  if (!form) {
    return;
  }

  const savedAdmin = getAdminSession();
  if (savedAdmin) {
    showAdminDashboard(savedAdmin);
    loadAdminDashboard();
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearFieldErrors(["adminAccessKey", "adminPassword"]);

    const feedback = document.getElementById("adminLoginFeedback");
    const accessKey = document.getElementById("adminAccessKey").value.trim();
    const password = document.getElementById("adminPassword").value;

    feedback.className = "feedback";
    feedback.textContent = "";

    if (!accessKey || !password) {
      if (!accessKey) {
        document.getElementById("adminAccessKeyError").textContent = "Chave de acesso é obrigatória.";
      }

      if (!password) {
        document.getElementById("adminPasswordError").textContent = "Senha é obrigatória.";
      }

      showFeedback(feedback, "Preencha chave de acesso e senha.", "error");
      return;
    }

    try {
      const payload = await sendJson("/api/admin/login", { accessKey, password });
      sessionStorage.setItem("admin", JSON.stringify(payload.admin));
      showAdminDashboard(payload.admin);
      await loadAdminDashboard();
    } catch (error) {
      showFeedback(feedback, error.message, "error");
    }
  });
}

function showAdminDashboard(admin) {
  document.getElementById("adminLoginPanel").classList.add("is-hidden");
  document.getElementById("adminDashboard").classList.remove("is-hidden");
  document.getElementById("adminWelcome").textContent = "Olá, " + admin.name;
  document.getElementById("adminRoleText").textContent = admin.role === "master"
    ? "Você está usando a conta ADMIN MASTER com acesso total."
    : "Você está usando a conta ADMIN com permissão operacional.";
}

async function loadAdminDashboard() {
  const admin = getAdminSession();
  const feedback = document.getElementById("adminFeedback");

  if (!admin || !document.getElementById("adminDashboard")) {
    return;
  }

  try {
    const payload = await getJson("/api/admin/overview", { adminKey: admin.accessKey });
    renderAdminStats(payload.stats);
    renderSectionVisibility(payload.admin.role);
    renderNutritionists(payload.nutritionists, payload.admin.role);
    renderSupportMessages(payload.supportMessages, payload.admin.role);
    renderMasterArea(payload);
  } catch (error) {
    showFeedback(feedback, error.message, "error");
  }
}

function renderSectionVisibility(role) {
  const nutritionistsSection = document.getElementById("nutritionistsSection");
  const supportSection = document.getElementById("supportSection");

  nutritionistsSection.classList.toggle("is-hidden", role === "support");
  supportSection.classList.toggle("is-hidden", role === "admin");
}

function renderAdminStats(stats) {
  document.getElementById("statTotal").textContent = stats.totalNutritionists;
  document.getElementById("statPending").textContent = stats.pendingNutritionists;
  document.getElementById("statApproved").textContent = stats.approvedNutritionists;
  document.getElementById("statRejected").textContent = stats.rejectedNutritionists;
  document.getElementById("statOpenTickets").textContent = stats.openSupportMessages;
  document.getElementById("contactedCount").textContent = stats.contactedNutritionists + " contatos";
}

function renderNutritionists(nutritionists, role) {
  const table = document.getElementById("nutritionistsTable");

  if (!nutritionists.length) {
    table.innerHTML = '<tr><td colspan="6">Nenhum cadastro encontrado.</td></tr>';
    return;
  }

  const canDecide = role === "master" || role === "admin";

  table.innerHTML = nutritionists.map((item) => {
    const statusLabel = {
      pending: "pendente",
      approved: "aprovado",
      rejected: "desaprovado"
    }[item.status] || item.status;

    const supportText = item.supportNote
      ? escapeHtml(item.supportNote)
      : "Sem contato registrado";

    const decisionButtons = canDecide
      ? `
        <button class="text-button" data-approve-id="${item.id}" type="button">Aprovar</button>
        <button class="danger-button" data-reject-id="${item.id}" type="button">Desaprovar</button>
      `
      : "";

    return `
      <tr>
        <td>
          <strong>${escapeHtml(item.name)}</strong>
          <div class="small-note">CPF ${escapeHtml(item.cpf)}</div>
        </td>
        <td>${escapeHtml(item.crn)}<div class="small-note">${escapeHtml(item.crnRegion)}</div></td>
        <td>${escapeHtml(item.email)}</td>
        <td><span class="status ${escapeHtml(item.status)}">${statusLabel}</span></td>
        <td class="support-cell">${supportText}</td>
        <td>
          <div class="action-row">
            ${decisionButtons}
            <button class="text-button" data-contact-id="${item.id}" data-contact-name="${escapeHtml(item.name)}" type="button">Contato</button>
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

function renderMasterArea(payload) {
  const masterArea = document.getElementById("masterArea");

  if (!masterArea) {
    return;
  }

  if (payload.admin.role !== "master") {
    masterArea.classList.add("is-hidden");
    return;
  }

  masterArea.classList.remove("is-hidden");
  document.getElementById("serverDatabaseFile").textContent = payload.server.databaseFile;
  document.getElementById("serverDatabaseSize").textContent = payload.server.databaseSizeKb + " KB";
  document.getElementById("serverPythonVersion").textContent = payload.server.pythonVersion;
  document.getElementById("serverUptime").textContent = payload.server.serverUptime;

  const adminsList = document.getElementById("adminsList");
  adminsList.innerHTML = payload.admins.map((admin) => `
    <div class="admin-item">
      <div>
        <strong>${escapeHtml(admin.name)}</strong>
        <span>${escapeHtml(admin.accessKey)} · ${admin.role === "master" ? "ADMIN MASTER" : "ADMIN"}</span>
      </div>
      <select class="role-select" data-admin-role-id="${admin.id}">
        <option value="admin" ${admin.role === "admin" ? "selected" : ""}>ADMIN</option>
        <option value="master" ${admin.role === "master" ? "selected" : ""}>ADMIN MASTER</option>
      </select>
    </div>
  `).join("");
}

function renderSupportMessages(supportMessages, role) {
  const table = document.getElementById("supportMessagesTable");
  const countPill = document.getElementById("ticketCount");

  if (!table) {
    return;
  }

  const canReply = role === "master" || role === "support";
  countPill.textContent = supportMessages.length + " chamados";

  if (!supportMessages.length) {
    table.innerHTML = '<tr><td colspan="6">Nenhum chamado registrado.</td></tr>';
    return;
  }

  table.innerHTML = supportMessages.map((item) => {
    const statusLabel = {
      open: "aberto",
      in_progress: "em andamento",
      closed: "finalizado"
    }[item.status] || item.status;

    const responseText = item.response
      ? escapeHtml(item.response)
      : "Ainda sem resposta";

    const actionButtons = canReply
      ? `
        <button class="text-button" data-reply-id="${item.id}" data-reply-name="${escapeHtml(item.name)}" type="button">Responder</button>
        <button class="danger-button" data-close-id="${item.id}" data-close-name="${escapeHtml(item.name)}" type="button">Finalizar</button>
      `
      : "";

    return `
      <tr>
        <td>
          <strong>${escapeHtml(item.name)}</strong>
          <div class="small-note">${escapeHtml(item.email)}</div>
        </td>
        <td>${escapeHtml(item.subject)}</td>
        <td class="support-cell">
          ${escapeHtml(item.message)}
          <div class="small-note">Resposta: ${responseText}</div>
        </td>
        <td>${item.assignedAdminName ? escapeHtml(item.assignedAdminName) : "Não atribuído"}</td>
        <td><span class="status ${escapeHtml(item.status)}">${statusLabel}</span></td>
        <td>
          <div class="action-row">
            ${actionButtons}
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

function setupAdminActions() {
  const dashboard = document.getElementById("adminDashboard");

  if (!dashboard) {
    return;
  }

  document.getElementById("refreshAdminButton").addEventListener("click", loadAdminDashboard);

  document.getElementById("adminLogoutButton").addEventListener("click", () => {
    sessionStorage.removeItem("admin");
    window.location.reload();
  });

  dashboard.addEventListener("click", async (event) => {
    const admin = getAdminSession();
    const feedback = document.getElementById("adminFeedback");
    const approveButton = event.target.closest("[data-approve-id]");
    const rejectButton = event.target.closest("[data-reject-id]");
    const contactButton = event.target.closest("[data-contact-id]");
    const replyButton = event.target.closest("[data-reply-id]");
    const closeButton = event.target.closest("[data-close-id]");

    try {
      if (approveButton) {
        const payload = await sendJson(
          "/api/nutritionists/" + approveButton.dataset.approveId + "/approve",
          {},
          { adminKey: admin.accessKey }
        );
        showFeedback(feedback, payload.message, "success");
        await loadAdminDashboard();
      }

      if (rejectButton) {
        const reason = await openAdminActionModal({
          title: "Desaprovar cadastro",
          description: "Informe o motivo da desaprovação para manter o histórico do atendimento.",
          defaultValue: "Dados inconsistentes ou incompletos.",
          placeholder: "Ex.: CRN informado não confere com a região."
        });

        if (!reason) {
          return;
        }

        const payload = await sendJson(
          "/api/nutritionists/" + rejectButton.dataset.rejectId + "/reject",
          { reason },
          { adminKey: admin.accessKey }
        );
        showFeedback(feedback, payload.message, "success");
        await loadAdminDashboard();
      }

      if (contactButton) {
        const note = await openAdminActionModal({
          title: "Registrar contato",
          description: "Descreva o contato feito com " + contactButton.dataset.contactName + ".",
          defaultValue: "Contato solicitado para correção de dados.",
          placeholder: "Ex.: Enviado e-mail solicitando correção do CRN."
        });

        if (!note) {
          return;
        }

        const payload = await sendJson(
          "/api/nutritionists/" + contactButton.dataset.contactId + "/contact",
          { note },
          { adminKey: admin.accessKey }
        );
        showFeedback(feedback, payload.message, "success");
        await loadAdminDashboard();
      }

      if (replyButton) {
        const response = await openAdminActionModal({
          title: "Responder chamado",
          description: "Escreva a resposta para " + replyButton.dataset.replyName + ". O chamado continuará em andamento.",
          placeholder: "Ex.: Reenviamos o e-mail de confirmação, verifique sua caixa de entrada."
        });

        if (!response) {
          return;
        }

        const payload = await sendJson(
          "/api/support/messages/" + replyButton.dataset.replyId + "/reply",
          { response, status: "in_progress" },
          { adminKey: admin.accessKey }
        );
        showFeedback(feedback, payload.message, "success");
        await loadAdminDashboard();
      }

      if (closeButton) {
        const response = await openAdminActionModal({
          title: "Finalizar chamado",
          description: "Escreva a resposta final para " + closeButton.dataset.closeName + " antes de encerrar o chamado.",
          placeholder: "Ex.: Problema resolvido, acesso liberado com sucesso."
        });

        if (!response) {
          return;
        }

        const payload = await sendJson(
          "/api/support/messages/" + closeButton.dataset.closeId + "/reply",
          { response, status: "closed" },
          { adminKey: admin.accessKey }
        );
        showFeedback(feedback, payload.message, "success");
        await loadAdminDashboard();
      }
    } catch (error) {
      showFeedback(feedback, error.message, "error");
    }
  });

  dashboard.addEventListener("change", async (event) => {
    const select = event.target.closest("[data-admin-role-id]");

    if (!select) {
      return;
    }

    const admin = getAdminSession();
    const feedback = document.getElementById("adminFeedback");

    try {
      const payload = await sendJson(
        "/api/admins/" + select.dataset.adminRoleId + "/role",
        { role: select.value },
        { adminKey: admin.accessKey }
      );
      showFeedback(feedback, payload.message, "success");
      await loadAdminDashboard();
    } catch (error) {
      showFeedback(feedback, error.message, "error");
      await loadAdminDashboard();
    }
  });
}

function setupSupportRequestForm() {
  const form = document.getElementById("supportForm");
  const feedback = document.getElementById("supportFeedback");

  if (!form) {
    return;
  }

  const fields = [
    { id: "supportName", label: "Nome" },
    { id: "supportEmail", label: "E-mail" },
    { id: "supportSubject", label: "Assunto" },
    { id: "supportMessage", label: "Mensagem" }
  ];

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearFieldErrors(fields.map((field) => field.id));
    feedback.className = "feedback";
    feedback.textContent = "";

    if (!requireFields(fields)) {
      showFeedback(feedback, "Preencha todos os campos para enviar sua mensagem.", "error");
      return;
    }

    const data = {
      name: document.getElementById("supportName").value.trim(),
      email: document.getElementById("supportEmail").value.trim(),
      subject: document.getElementById("supportSubject").value,
      message: document.getElementById("supportMessage").value.trim()
    };

    try {
      const payload = await sendJson("/api/support/request", data);
      form.reset();
      showFeedback(feedback, payload.message, "success");
    } catch (error) {
      showFeedback(feedback, error.message, "error");
    }
  });
}

/* DASHBOARD DO NUTRICIONISTA */
function setupDashboard() {
  const welcomeText = document.getElementById("welcomeText");
  const nutritionist = getNutritionistSession();

  if (!nutritionist) {
    window.location.href = "login.html";
    return;
  }

  if (welcomeText) {
    welcomeText.textContent = "Bem-vindo(a), " + nutritionist.name;
  }

  setupDashboardNavigation();
  setupDashboardActions();
  loadDashboardData();
}

function setupDashboardNavigation() {
  const navItems = document.querySelectorAll(".nav-item[data-section]");
  const sections = document.querySelectorAll(".dashboard-section");
  const logoutButton = document.getElementById("logoutButton");

  if (navItems.length === 0) return;

  navItems.forEach((item) => {
    item.addEventListener("click", (e) => {
      e.preventDefault();

      const sectionName = item.dataset.section;

      // Remove active de todos
      navItems.forEach((nav) => nav.classList.remove("active"));
      sections.forEach((section) => section.classList.add("is-hidden"));

      // Adiciona active ao clicado
      item.classList.add("active");

      // Mostra a seção correta
      const targetSection = document.getElementById(sectionName + "Section");
      if (targetSection) {
        targetSection.classList.remove("is-hidden");
      }
    });
  });

  if (logoutButton) {
    logoutButton.addEventListener("click", () => {
      sessionStorage.removeItem("nutritionist");
      window.location.href = "login.html";
    });
  }

  const refreshButton = document.getElementById("refreshButton");
  if (refreshButton) {
    refreshButton.addEventListener("click", loadDashboardData);
  }
}

function setupDashboardActions() {
  // Botões de ação rápida do dashboard
  const newPatientButtons = document.querySelectorAll('[data-action="new-patient"]');
  const newFoodButtons = document.querySelectorAll('[data-action="new-food"]');
  const newConsultButtons = document.querySelectorAll('[data-action="new-consult"]');
  const newPatientPageButton = document.getElementById("newPatientButton");
  const newFoodPageButton = document.getElementById("newFoodButton");
  const newConsultPageButton = document.getElementById("newConsultButton");

  newPatientButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      openGenericModal("Novo paciente", "Funcionalidade em desenvolvimento. Em breve você poderá adicionar novos pacientes aqui.");
    });
  });

  newFoodButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      openGenericModal("Novo alimento", "Funcionalidade em desenvolvimento. Em breve você poderá adicionar alimentos ao banco de dados.");
    });
  });

  newConsultButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      openGenericModal("Agendar consulta", "Funcionalidade em desenvolvimento. Em breve você poderá agendar consultas com seus pacientes.");
    });
  });

  if (newPatientPageButton) {
    newPatientPageButton.addEventListener("click", () => {
      openGenericModal("Novo paciente", "Funcionalidade em desenvolvimento. Em breve você poderá adicionar novos pacientes aqui.");
    });
  }

  if (newFoodPageButton) {
    newFoodPageButton.addEventListener("click", () => {
      openGenericModal("Novo alimento", "Funcionalidade em desenvolvimento. Em breve você poderá adicionar alimentos ao banco de dados.");
    });
  }

  if (newConsultPageButton) {
    newConsultPageButton.addEventListener("click", () => {
      openGenericModal("Agendar consulta", "Funcionalidade em desenvolvimento. Em breve você poderá agendar consultas com seus pacientes.");
    });
  }
}

async function loadDashboardData() {
  const nutritionist = getNutritionistSession();
  const feedback = document.getElementById("dashboardFeedback");

  if (!nutritionist) return;

  try {
    // Atualizar estatísticas
    document.getElementById("statTotalPatients").textContent = "0";
    document.getElementById("statActivePatients").textContent = "0";
    document.getElementById("statUpcomingConsults").textContent = "0";
    document.getElementById("statUnreadMessages").textContent = "0";
  } catch (error) {
    if (feedback) {
      showFeedback(feedback, "Erro ao carregar dados: " + error.message, "error");
    }
  }
}

/* INICIALIZAÇÕES */
setupPasswordToggle();
setupRegisterForm();
setupLoginForm();
setupAdminLogin();
setupAdminActions();
setupSupportRequestForm();
setupDashboard();
