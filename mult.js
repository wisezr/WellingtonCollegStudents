
const form = document.getElementById("multiplierForm");

const errorBox = document.getElementById("error");
const results = document.getElementById("results");

// Round numbers to 3 decimal places
function round3(number) {
    return Number(number.toFixed(3));
}

// Format numbers as GBP currency
function formatMoney(number) {
    return number.toLocaleString("en-GB", {
        style: "currency",
        currency: "GBP",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

// Display an error message
function showError(message) {
    errorBox.textContent = message;
    errorBox.hidden = false;
    results.hidden = true;
}

// Calculate the multiplier
form.addEventListener("submit", function (event) {
    event.preventDefault();

    errorBox.hidden = true;
    results.hidden = true;

    // Read the input values
    const mpsInput = document.getElementById("mps").value.trim();
    const mptInput = document.getElementById("mpt").value.trim();
    const mpmInput = document.getElementById("mpm").value.trim();
    const injectionInput =
        document.getElementById("injection").value.trim();

    // Check that every field has been filled in
    if (
        mpsInput === "" ||
        mptInput === "" ||
        mpmInput === "" ||
        injectionInput === ""
    ) {
        showError("Please fill in all four fields.");
        return;
    }

    // Convert inputs to numbers
    const MPS = Number(mpsInput);
    const MPT = Number(mptInput);
    const MPM = Number(mpmInput);
    const injection = Number(injectionInput);

    // Check for invalid numbers
    if (
        !Number.isFinite(MPS) ||
        !Number.isFinite(MPT) ||
        !Number.isFinite(MPM) ||
        !Number.isFinite(injection)
    ) {
        showError("Please enter valid numerical values.");
        return;
    }

    // Check the range of marginal propensities
    if (
        MPS < 0 || MPS > 1 ||
        MPT < 0 || MPT > 1 ||
        MPM < 0 || MPM > 1
    ) {
        showError(
            "MPS, MPT and MPM must each be between 0 and 1."
        );
        return;
    }

    // Check the injection
    if (injection < 0) {
        showError("The injection cannot be negative.");
        return;
    }

    // MPW calculation
    const MPW = MPS + MPT + MPM;

    if (MPW <= 0) {
        showError("Error: MPW must be greater than 0.");
        return;
    }

    // Multiplier calculation
    const multiplier = 1 / MPW;

    // Rise in national income
    const incomeRise = multiplier * injection;

    // Check that calculations remain finite
    if (
        !Number.isFinite(multiplier) ||
        !Number.isFinite(incomeRise)
    ) {
        showError(
            "The result is too large to calculate reliably."
        );
        return;
    }

    // Display MPW
    document.getElementById("mpwResult").textContent =
        round3(MPW).toFixed(3);

    // Display multiplier
    document.getElementById("multiplierResult").textContent =
        round3(multiplier).toFixed(3);

    // Display injection
    document.getElementById("injectionResult").textContent =
        formatMoney(injection);

    // Display rise in national income
    document.getElementById("incomeResult").textContent =
        formatMoney(incomeRise);

    // Display a brief interpretation
    document.getElementById("incomeMessage").textContent =
        "The calculated increase in national income is " +
        formatMoney(incomeRise) + ".";

    // Reveal the results panel
    results.hidden = false;

    // Bring the results into view
    results.scrollIntoView({
        behavior: "smooth",
        block: "start"
    });
});

// Reset the calculator
form.addEventListener("reset", function () {
    errorBox.hidden = true;
    results.hidden = true;

    document.getElementById("mpwResult").textContent = "—";
    document.getElementById("multiplierResult").textContent = "—";
    document.getElementById("injectionResult").textContent = "—";
    document.getElementById("incomeResult").textContent = "—";
    document.getElementById("incomeMessage").textContent = "";
});
