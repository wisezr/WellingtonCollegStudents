
function classifyPED(ped) {
    if (ped === 0) return "Perfectly Inelastic";
    if (ped === Infinity) return "Perfectly Elastic";
    if (ped < 1) return "Inelastic";
    if (ped === 1) return "Unitary Elastic";
    return "Elastic";
}

function parseValues(text) {
    if (text.trim() === "") return [];
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
            message = "PED cannot be calculated using the midpoint formula.";
        } else {
            const averagePrice = (p1 + p2) / 2;
            const averageQuantity = (q1 + q2) / 2;

            const percentChangeP = (p2 - p1) / averagePrice;
            const percentChangeQ = (q2 - q1) / averageQuantity;

            ped = Math.abs(percentChangeQ / percentChangeP);
        }

        results.push({
            interval: i + 1,
            p1, p2, q1, q2, ped, message
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
                `PED = ${result.ped === Infinity
                    ? "Infinity"
                    : result.ped.toFixed(3)}`;
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

// ------------------------------
// Animated demand graph
// ------------------------------

const chart = document.getElementById("demand-chart");
const ctx = chart.getContext("2d");
const graphSummary = document.getElementById("graph-summary");

let graphPoints = [];
let animationFrame = null;

function drawDemandGraph(progress = 1) {
    const rect = chart.getBoundingClientRect();

    if (rect.width === 0 || rect.height === 0) return;

    const width = rect.width;
    const height = rect.height;
    const dpr = window.devicePixelRatio || 1;

    // Keep the canvas sharp on high-resolution screens.
    chart.width = Math.round(width * dpr);
    chart.height = Math.round(height * dpr);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    if (graphPoints.length < 2) return;

    const padding = {
        left: 65,
        right: 25,
        top: 25,
        bottom: 55
    };

    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;

    const quantities = graphPoints.map(point => point.quantity);
    const prices = graphPoints.map(point => point.price);

    let minQ = Math.min(...quantities);
    let maxQ = Math.max(...quantities);
    let minP = Math.min(...prices);
    let maxP = Math.max(...prices);

    // Give constant values a visible range.
    if (minQ === maxQ) {
        minQ -= 1;
        maxQ += 1;
    }

    if (minP === maxP) {
        minP -= 1;
        maxP += 1;
    }

    const qPadding = (maxQ - minQ) * 0.1;
    const pPadding = (maxP - minP) * 0.1;

    minQ -= qPadding;
    maxQ += qPadding;
    minP -= pPadding;
    maxP += pPadding;

    const x = q =>
        padding.left + ((q - minQ) / (maxQ - minQ)) * plotWidth;

    const y = p =>
        padding.top + ((maxP - p) / (maxP - minP)) * plotHeight;

    // Grid and tick labels.
    ctx.font = "12px Arial";
    ctx.lineWidth = 1;
    ctx.strokeStyle = "#e5ebf2";
    ctx.fillStyle = "#66758a";

    const ticks = 5;

    for (let i = 0; i <= ticks; i++) {
        const fraction = i / ticks;

        const gx = padding.left + fraction * plotWidth;
        const gy = padding.top + fraction * plotHeight;

        ctx.beginPath();
        ctx.moveTo(gx, padding.top);
        ctx.lineTo(gx, height - padding.bottom);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(padding.left, gy);
        ctx.lineTo(width - padding.right, gy);
        ctx.stroke();

        const qValue = minQ + fraction * (maxQ - minQ);
        const pValue = maxP - fraction * (maxP - minP);

        ctx.textAlign = "center";
        ctx.fillText(
            Number(qValue.toFixed(2)).toString(),
            gx,
            height - padding.bottom + 20
        );

        ctx.textAlign = "right";
        ctx.fillText(
            Number(pValue.toFixed(2)).toString(),
            padding.left - 10,
            gy + 4
        );
    }

    // Axis titles.
    ctx.fillStyle = "#102b46";
    ctx.font = "bold 13px Arial";
    ctx.textAlign = "center";
    ctx.fillText(
        "Quantity demanded (Q)",
        padding.left + plotWidth / 2,
        height - 10
    );

    ctx.save();
    ctx.translate(17, padding.top + plotHeight / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("Price (P)", 0, 0);
    ctx.restore();

    // Draw the demand curve progressively.
    const totalSegments = graphPoints.length - 1;
    const visibleSegments = progress * totalSegments;
    const fullSegments = Math.floor(visibleSegments);
    const partialSegment = visibleSegments - fullSegments;

    ctx.beginPath();
    ctx.strokeStyle = "#1684b5";
    ctx.lineWidth = 3;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    ctx.moveTo(x(graphPoints[0].quantity), y(graphPoints[0].price));

    for (let i = 1; i <= fullSegments; i++) {
        ctx.lineTo(
            x(graphPoints[i].quantity),
            y(graphPoints[i].price)
        );
    }

    if (fullSegments < totalSegments && partialSegment > 0) {
        const start = graphPoints[fullSegments];
        const end = graphPoints[fullSegments + 1];

        const q = start.quantity +
            (end.quantity - start.quantity) * partialSegment;
        const p = start.price +
            (end.price - start.price) * partialSegment;

        ctx.lineTo(x(q), y(p));
    }

    ctx.stroke();

    // Fade in the data points as the animation progresses.
    graphPoints.forEach((point, index) => {
        const pointProgress = graphPoints.length === 1
            ? 1
            : index / (graphPoints.length - 1);

        if (pointProgress > progress) return;

        ctx.beginPath();
        ctx.arc(x(point.quantity), y(point.price), 5, 0, Math.PI * 2);
        ctx.fillStyle = "#102b46";
        ctx.fill();

        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2;
        ctx.stroke();
    });
}

function animateGraph() {
    if (animationFrame !== null) {
        cancelAnimationFrame(animationFrame);
    }

    const duration = 1200;
    const startTime = performance.now();

    function frame(now) {
        const elapsed = Math.min((now - startTime) / duration, 1);

        // Ease-out animation: fast at first, then slows down.
        const progress = 1 - Math.pow(1 - elapsed, 3);

        drawDemandGraph(progress);

        if (elapsed < 1) {
            animationFrame = requestAnimationFrame(frame);
        } else {
            animationFrame = null;
        }
    }

    animationFrame = requestAnimationFrame(frame);
}

// ------------------------------
// Form submission and validation
// ------------------------------

document.getElementById("ped-form").addEventListener("submit", event => {
    event.preventDefault();

    const error = document.getElementById("error");
    const prices = parseValues(document.getElementById("prices").value);
    const quantities = parseValues(
        document.getElementById("quantities").value
    );

    error.textContent = "";

    if (prices.length !== quantities.length) {
        error.textContent =
            "Error: Enter the same number of prices and quantities.";
        return;
    }

    if (prices.length < 2) {
        error.textContent =
            "Error: Enter at least two price-quantity pairs.";
        return;
    }

    if ([...prices, ...quantities].some(
        value => !Number.isFinite(value) || value < 0
    )) {
        error.textContent =
            "Error: Values must be valid, non-negative numbers.";
        return;
    }

    displayResults(calculatePED(prices, quantities));

    graphPoints = quantities.map((quantity, index) => ({
        quantity,
        price: prices[index]
    }));

    // Draw from the lowest to the highest quantity.
    graphPoints.sort((a, b) => a.quantity - b.quantity);

    graphSummary.textContent =
        `${graphPoints.length} data points plotted. ` +
        "The curve shows the relationship between price and quantity.";

    animateGraph();
});

// Clear the calculator and graph.
document.getElementById("ped-form").addEventListener("reset", () => {
    document.getElementById("error").textContent = "";
    document.getElementById("summary").textContent =
        "Your results will appear here.";
    document.getElementById("results-list").replaceChildren();

    graphPoints = [];

    if (animationFrame !== null) {
        cancelAnimationFrame(animationFrame);
        animationFrame = null;
    }

    ctx.clearRect(0, 0, chart.width, chart.height);

    graphSummary.textContent =
        "Your graph will appear here after calculation.";
});

// Redraw the completed graph when the screen size changes.
window.addEventListener("resize", () => {
    if (graphPoints.length >= 2) {
        drawDemandGraph(1);
    }
});
