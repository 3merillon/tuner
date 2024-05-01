let Tuner = function (a4) {
	this.middleA = a4 || 442;
	this.semitone = 69;
	this.bufferSize = 2048;
	this.noteStrings = [
		"C","C♯","D","D♯","E","F","F♯","G","G♯","A","A♯","B",
	];

	this.customNoteFunctions = [
		'1','16/15','9/8','6/5','81/64','4/3','64/45','3/2','8/5','27/16','9/5','Math.sqrt(2)*3/Math.sqrt(5)'
	];

	this.customNoteFunctionsEvaluated = this.customNoteFunctions.map(func => this.middleA * eval(func));

	this.generateComparisonTable = function() {
		let comparisonTable = [];
		comparisonTable[0] = Math.sqrt((this.customNoteFunctionsEvaluated[11] / 2) * this.customNoteFunctionsEvaluated[0]);
		for (let i = 0; i < this.customNoteFunctionsEvaluated.length - 1; i++) {
			let midpoint = Math.sqrt(this.customNoteFunctionsEvaluated[i] * this.customNoteFunctionsEvaluated[i + 1]);
			comparisonTable.push(midpoint);
		}
		comparisonTable.push(Math.sqrt(this.customNoteFunctionsEvaluated[11] * (this.customNoteFunctionsEvaluated[0] * 2)));
		return comparisonTable;
	}

	this.customNoteComparisonTable = this.generateComparisonTable();

	this.createEditableFunctionsUI();

	this.updateMiddleA = function(newA) {
		this.middleA = newA;
		this.customNoteFunctionsEvaluated = this.customNoteFunctions.map(func => this.middleA * eval(func));
		this.customNoteComparisonTable = this.generateComparisonTable();
		this.createEditableFunctionsUI();
	};

	this.initGetUserMedia = function() {
	};
};

Tuner.prototype.createEditableFunctionsUI = function() {
	const customNoteFunctionsTable = document.getElementById('custom-note-functions');
	customNoteFunctionsTable.innerHTML = '';
	this.customNoteFunctions.forEach((func, index) => {
		const row = document.createElement('tr');
		const noteCell = document.createElement('td');
		const noteNames = [ "A4", "A#4", "B4", "C5", "C#5", "D5", "D#5", "E5", "F5", "F#5", "G5", "G#5" ];
		noteCell.textContent = noteNames[index];
		const functionCell = document.createElement('td');
		const functionInput = document.createElement('input');
		
		const resultCell = document.createElement('td');
		resultCell.textContent = (this.middleA * eval(this.customNoteFunctions[index])).toFixed(2);
		
		functionInput.type = 'text';
		functionInput.value = this.customNoteFunctions[index];
		functionInput.addEventListener('change', (event) => {
			this.customNoteFunctions[index] = event.target.value;
			this.customNoteFunctionsEvaluated[index] = this.middleA * eval(`(${event.target.value})`);
			if (this.updateCallback) {
				this.updateCallback();
			}
			this.createEditableFunctionsUI();
		});
		functionCell.appendChild(functionInput);
		row.appendChild(noteCell);
		row.appendChild(functionCell);
		row.appendChild(resultCell);
		
		customNoteFunctionsTable.appendChild(row);
	});
};

Tuner.prototype.updateCustomNoteFunctionsEvaluated = function() {
	this.customNoteFunctionsEvaluated = this.customNoteFunctions.map(func => this.middleA * eval(func));
};

Tuner.prototype.registerUpdateCallback = function(callback) {
	this.updateCallback = callback;
	this.createEditableFunctionsUI();
};

Tuner.prototype.initGetUserMedia = function () {
	window.AudioContext = window.AudioContext || window.webkitAudioContext;
	if (!window.AudioContext) {
		return alert("AudioContext not supported");
	}

	if (navigator.mediaDevices === undefined) {
		navigator.mediaDevices = {};
	}

	if (navigator.mediaDevices.getUserMedia === undefined) {
		navigator.mediaDevices.getUserMedia = function (constraints) {
			const getUserMedia =
				navigator.webkitGetUserMedia || navigator.mozGetUserMedia;

			if (!getUserMedia) {
				alert("getUserMedia is not implemented in this browser");
			}

			return new Promise(function (resolve, reject) {
				getUserMedia.call(navigator, constraints, resolve, reject);
			});
		};
	}
};

Tuner.prototype.startRecord = function () {
	const self = this;
	navigator.mediaDevices
		.getUserMedia({ audio: true })
		.then(function (stream) {
			self.audioContext.createMediaStreamSource(stream).connect(self.analyser);
			self.analyser.connect(self.scriptProcessor);
			self.scriptProcessor.connect(self.audioContext.destination);
			self.scriptProcessor.addEventListener("audioprocess", function (event) {
				const frequency = self.pitchDetector.do(
					event.inputBuffer.getChannelData(0)
				);
				if (frequency && self.onNoteDetected) {
					const note = self.getNote(frequency);
					self.onNoteDetected({
						name: self.noteStrings[note % 12],
						value: note,
						cents: self.getCents(frequency, note),
						octave: parseInt(note / 12) - 1,
						frequency: frequency,
					});
				}
			});
		})
		.catch(function (error) {
			alert(error.name + ": " + error.message);
		});
};

Tuner.prototype.init = function () {
	this.audioContext = new window.AudioContext();
	this.analyser = this.audioContext.createAnalyser();
	this.scriptProcessor = this.audioContext.createScriptProcessor(
		this.bufferSize,
		1,
		1
	);

	const self = this;

	aubio().then(function (aubio) {
		self.pitchDetector = new aubio.Pitch(
			"default",
			self.bufferSize,
			1,
			self.audioContext.sampleRate
		);
		self.startRecord();
	});
};

Tuner.prototype.getNote = function (frequency) {
	const note = 12 * (Math.log(frequency / this.middleA) / Math.log(2));
	return Math.round(note) + this.semitone;
};

Tuner.prototype.getStandardFrequency = function (note) {
	let noteDiff = note - this.semitone;
	let index = (noteDiff % 12 + 12) % 12;
	let octaveAdjustment = Math.floor(noteDiff / 12);
	let frequency = this.customNoteFunctionsEvaluated[index];
	frequency *= Math.pow(2, octaveAdjustment);
	return frequency;
};

Tuner.prototype.getCents = function (frequency, note) {
	return Math.floor(
		(1200 * Math.log(frequency / this.getStandardFrequency(note))) / Math.log(2)
	);
};

Tuner.prototype.play = function (frequency) {
	if (!this.oscillator) {
		this.oscillator = this.audioContext.createOscillator();
		this.oscillator.connect(this.audioContext.destination);
		this.oscillator.start();
	}
	this.oscillator.frequency.value = frequency;
};

Tuner.prototype.update = function (frequency) {
	if (this.oscillator) {
		this.oscillator.frequency.value = frequency;
	}
};

Tuner.prototype.stopOscillator = function () {
	if (this.oscillator) {
		this.oscillator.stop();
		this.oscillator = null;
	}
};