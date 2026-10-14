
function classifyPED(ped) {
    if (ped === 0) {
        return "Perfectly Inelastic";
    } else if (ped === Infinity) {
        return "Perfectly Elastic";
    } else if (ped > 1) {
        return "Elastic";
    } else if (ped < 1) {
        return "Inelastic";
    } else {
        return "Unitary Elastic";
    }
}

function parseValues(text) {
    if (text.trim() === "") {
        return [];
    }

    return text.trim().split(/[\s,]+/).map(Number);
}

function calculatePED(prices, quantities) {
    const results = [];

    for (let i = 0; i < prices.length - 1; i++) {
        const p1 = prices[i];
        const p2 = prices[i + 1];
        const q1 = quantities[i];
        const q2 = quantities[i + 1];

        let ped = null;
        let message = "";

        if (p1 === p2 && q1 === q2) {
            message = "No change; PED undefined.";
        } else if (q1 === q2) {
            ped = 0;
        } else if (p1 === p2) {
            ped = Infinity;
        } else if (p1 + p2 === 0 || q1 + q2 === 0) {
            message = "PED cannot be calculated.";
        } else {
            const averagePrice = (p1 + p2) / 2;
            const averageQuantity = (q1 + q2) / 2;

            const percentChangeP =
                (p2 - p1) / averagePrice;

            const percentChangeQ =
                (q2 - q1) / averageQuantity;

            ped = Math.abs(percentChangeQ / percentChangeP);
        }

        results.push({
            interval: i + 1,
            p1,
            p2,
            q1,
            q2,
            ped,
            message
        });
    }

    return results;
}

function displayResults(results) {
    const container = document.getElementById("results-list");
    const summary = document.getElementById("summary");

    container.replaceChildren();

    let successful = 0;

    results.forEach(result => {
        const card = document.createElement("article");
        card.className = "result-card";

        const heading = document.createElement("h3");
        heading.textContent = `Interval ${result.interval}`;
        card.appendChild(heading);

        const details = document.createElement("p");
        details.textContent =
            `Price: ${result.p1} → ${result.p2} | ` +
            `Quantity: ${result.q1} → ${result.q2}`;
        card.appendChild(details);

        if (result.message) {
            const message = document.createElement("p");
            message.className = "result-message";
            message.textContent = result.message;
            card.appendChild(message);
        } else {
            successful++;

            const value = document.createElement("p");
            value.className = "ped-value";
            value.textContent =
                `PED = ${
                    result.ped === Infinity
                        ? "Infinity"
                        : result.ped.toFixed(3)
                }`;
            card.appendChild(value);

            const classification = document.createElement("p");
            classification.className = "classification";
            classification.textContent = classifyPED(result.ped);
            card.appendChild(classification);
        }

        container.appendChild(card);
    });

    summary.textContent =
        `Processed ${results.length} intervals; ` +
        `${successful} PED values calculated.`;
}

document.getElementById("ped-form").addEventListener(
    "submit",
    function(event) {
        event.preventDefault();

        const error = document.getElementById("error");
        const summary = document.getElementById("summary");
        const container = document.getElementById("results-list");

        error.textContent = "";
        summary.textContent = "Your results will appear here.";
        container.replaceChildren();

        const prices = parseValues(
            document.getElementById("prices").value
        );

        const quantities = parseValues(
            document.getElementById("quantities").value
        );

        if (
            prices.length !== quantities.length
        ) {
            error.textContent =
                "Error: Enter the same number of prices and quantities.";
            return;
        }

        if (prices.length < 2) {
            error.textContent =
                "Error: Enter at least two price-quantity pairs.";
            return;
        }

        if (
            [...prices, ...quantities].some(
                value => !Number.isFinite(value) || value < 0
            )
        ) {
            error.textContent =
                "Error: Values must be valid, non-negative numbers.";
            return;
        }

        displayResults(calculatePED(prices, quantities));
    }
);

document.getElementById("ped-form").addEventListener(
    "reset",
    function() {
        document.getElementById("error").textContent = "";
        document.getElementById("summary").textContent =
            "Your results will appear here.";
        document.getElementById("results-list").replaceChildren();
    }
);
