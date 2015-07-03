SHELL=/bin/bash

ENVSETUP=source build/envsetup.sh $(1) && test "$$SILK_ENVSETUP" == "1"

.PHONY: all
all: | .repo/.repo_fetchtimes.json
	$(ENVSETUP) && time $(MAKE) -f build/core/main.mk

.PHONY: install
install: | .repo/.repo_fetchtimes.json
	$(ENVSETUP) && \
  adb root && \
  adb wait-for-device && \
  adb remount && \
  adb sync

.PHONY: uninstall
uninstall:
	$(ENVSETUP) && \
  adb root && \
  adb wait-for-device && \
  adb remount && \
  adb shell rm -rvf /system/silk /system/node_modules

.PHONY: clean
clean:
	rm -rf out

# https://youtu.be/1r_2fNiYkyE
.PHONY: zest
zest:
	git reset --hard HEAD && git clean -dx -f -f

.PHONY: sync
sync: | .repo/manifest.xml
	./repo sync -j4 --current-branch --no-tags

.PHONY: dist
dist: | .repo/manifest.xml
	$(call ENVSETUP,clean) # <-- drop all local patches before archiving
	$(call ENVSETUP,np) && ./gonk/archive.sh $(TARGET_PRODUCT)-$(shell date +%F_%H%M%S) dist

# Manipulate the silk service on device:
#
#  make silk-start
#  make silk-stop
#  make silk-restart
silk_service_targets := $(addprefix silk-, start stop restart)
.PHONY: $(silk_service_targets)
$(silk_service_targets):
	$(ENVSETUP) && \
  adb root && \
  adb wait-for-device && \
  adb shell setprop ctl.$(subst silk-,,$@) silk


# Set the device time
.PHONY: time
time:
	@echo Setting device time to match host
	$(ENVSETUP) && \
  adb root && \
  adb wait-for-device && \
  adb shell "toolbox date $(shell date +%s) || toolbox date -s $(shell date +%Y%m%d.%H%M%S)"

#
# Initialize the workspace with gonk/<gonk>/default.xml instead of the default
# gonk with:
#
#   $ make init.<gonk>
#
define __init_rules

.PHONY: init.$(1)

init.$(1): GONK=$(1)

init.$(1):
	rm -rf .repo/manifest*
	$(MAKE) .repo/manifest.xml GONK=$(1)

endef

$(eval \
  $(foreach manifest,$(subst /,,$(subst gonk/,,$(notdir $(basename $(wildcard gonk/manifest/*.xml))))),\
    $(call __init_rules,$(manifest))) \
)

init.%:
	@echo Error: gonk/$(subst init.,,$@)/default.xml does not exist
	@false


#
# Gonk manifest management (internal)
#

.repo/.repo_fetchtimes.json: .repo/manifest.xml
	./repo sync -j4 --current-branch --no-tags --quiet

.repo/manifest.xml: GONK=base# default gonk manifest
.repo/manifest.xml: | .repo/manifest_upstream
	./repo init -u $(PWD)/.repo/manifest_upstream -m $(GONK).xml \
    -g all,-notdefault,-x86,-mips,-linux,-darwin,-flo,-flounder,-fugu,-grouper,-hammerhead,-manta,$(shell uname | tr A-Z a-z) \
    $(REPO_INIT_ARGS)

.repo/manifest_upstream:
# Construct a faux 'upstream' manifest project to keep repo content.  Its
# manifest .xml files redirect out to gonk/manifest/* so that edits directly
# made in gonk/manifest/* will be picked up immediately by a |repo sync|
	@echo Forging upstream repo manifest for gonk: $(GONK)
	@{ \
    set -ex ; \
    mkdir -p .repo/manifest_upstream ; \
    cd .repo/manifest_upstream ; \
    git init --quiet . ; \
    for f in gonk/manifest/*; do ln -sf ../../$$f .; done; \
    git add *; \
    git commit -m '301 Moved Permanently' ; \
  }


# Catch-all, redirect to gonk build system
%: | .repo/manifest.xml
	$(ENVSETUP) && time $(MAKE) -f build/core/main.mk $@

# Disable implicit rule for GNUmakefile
GNUmakefile: ;
