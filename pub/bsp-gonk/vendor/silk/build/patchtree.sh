# Copyright (c) 2012-2015, The Linux Foundation. All rights reserved.
#
# Redistribution and use in source and binary forms, with or without
# modification, are permitted provided that the following conditions are
# met:
#     * Redistributions of source code must retain the above copyright
#       notice, this list of conditions and the following disclaimer.
#     * Redistributions in binary form must reproduce the above
#       copyright notice, this list of conditions and the following
#       disclaimer in the documentation and/or other materials provided
#       with the distribution.
#     * Neither the name of The Linux Foundation nor the names of its
#       contributors may be used to endorse or promote products derived
#       from this software without specific prior written permission.
#
# THIS SOFTWARE IS PROVIDED "AS IS" AND ANY EXPRESS OR IMPLIED
# WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF
# MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NON-INFRINGEMENT
# ARE DISCLAIMED.  IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS
# BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
# CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
# SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR
# BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY,
# WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE
# OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN
# IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

B2G_HASHED_FILES="${BASH_SOURCE[0]}"

# Include .repo_fetchtimes.json in the hash.  The contents of this file changes
# when the user runs |repo sync|.  Patches usually need to be reapplied on a
# |repo sync| as repo likes to remove all non-upstreamed commits.
B2G_HASHED_FILES="$B2G_HASHED_FILES .repo/.repo_fetchtimes.json"

REPO=${PWD}/.repo/repo/repo

__tree_md5sum()
{
   (
      export LANG=C
      FILELIST="$(find -L $@ -type f ! -path "*/.*" 2>/dev/null | sort -fs) ${B2G_HASHED_FILES}"
      cat ${FILELIST}
   ) | openssl dgst -md5
}


__abandon_branch()
{
  local branch=$1
  local FORCE="$2"

  if [[ -n "$(git branch --list autogen_ephemeral_branch)" ]]; then
    if [[ "$FORCE" != "force" && $(whoami) != "lnxbuild" ]]; then
      if [[ -n $(git status --porcelain) ]]; then
         echo
         echo "ERROR: Uncommitted changes found in $branch/"
         echo "       You may force overwriting these changes"
         echo "       with |source build/envsetup.sh force|"
         echo
         return 1
      fi
    fi
    git reset --quiet --hard HEAD
    git clean -dfx
    ${REPO} abandon autogen_ephemeral_branch .
  fi
}


__abandon_tree()
{
   local FORCE="$1"
   rm -f out/lastpatch.md5sum
   if [[ -d .repo ]]; then
     echo Abandoning ephemeral patches...
     if [[ -f out/lastpatch.projects ]]; then
       local projects=$(cat out/lastpatch.projects)
     else
       local projects=$(${REPO} forall -c pwd)
     fi

     for p in $projects; do
       #echo [$p]
       if [[ -d $p ]]; then
         cd $p ; __abandon_branch $p "$FORCE" ; cd $OLDPWD
       fi
     done
   fi
}


__patch_tree()
{
   (
      export GIT_COMMITTER_NAME=nobody
      export GIT_COMMITTER_EMAIL=nobody

      cd $(gettop)

      if [[ -z ${PATCH_TREE} ]]; then
        return 0
      fi

      for TREE in ${PATCH_TREE}; do
        echo "Patch tree: ${TREE}/"
        if [[ ! -d ${TREE} ]]; then
          echo Error: patch tree does not exist
          return 1
        fi
      done

      set -e
      local LASTMD5SUM=invalid
      local MD5SUM=unknown
      if [[ -f out/lastpatch.md5sum ]]; then
         LASTMD5SUM=$(cat out/lastpatch.md5sum)
         MD5SUM=$(__tree_md5sum ${PATCH_TREE})
      fi
      # We usually require building on a case-sensitive file system,
      # but as of 2015 our OS X CI does not use case-sensitive file
      # systems.  This results in git thinking there are changes in
      # bionic/ when in actuality git is confused by two files `FOO`
      # and `foo` not being distinguished.  So CI can pass this env
      # var to force applying patches, which is known to otherwise
      # work in its setup.
      FORCE="$CI_PATCHTREE_FORCE"
      if [[ $1 == "force" ]]; then
        FORCE=force
      fi

      if [[ "$LASTMD5SUM" != "$MD5SUM" || "force" == "$FORCE" ]]; then
         ROOT_DIR=${PWD}

         # Prepare all the affected projects for patching
         # * Ensure no local changes are present
         # * Create the ephemeral branch
         __abandon_tree "$FORCE"
         rm -f out/lastpatch.projects
         mkdir -p out

         echo Preparing projects for patching...
         branch() {
            if [[ ! -d $1 ]]; then
              echo Directory $1 does not exist
              return 1
            fi

            echo $1 >> out/lastpatch.projects
            pushd $1 > /dev/null
            echo -n "  $1: "
            if [[ -d .git ]]; then
               if [[ -d .git/rebase-apply ]]; then
                 git am --abort
               fi

               __abandon_branch $1 "$FORCE"
               ${REPO} start autogen_ephemeral_branch .
            else
               echo Error: Project $1 is not managed by git
               return 1
            fi
         }

         patched_projects()
         {
           (
             for TREE in ${PATCH_TREE}; do
               PATCHES=$(find $TREE -name \*.patch | sort -fs)
               for P in ${PATCHES}; do
                 PRJ=$(dirname ${P#${TREE}})
                 PRJ=`echo $PRJ | sed -e 's%^/%%'`
                 echo $PRJ
               done
             done
           ) | sort -fus
         }

         pushd . > /dev/null
         for PRJ in $(patched_projects); do
           if [[ ! -d $ROOT_DIR/$PRJ ]]; then
             echo =============================================================
             echo "Warning: $PRJ/ does not exist"
             echo =============================================================
             continue
           fi

           popd > /dev/null
           branch $PRJ
           if [[ "$FORCE" != "force" && $(whoami) != "lnxbuild" ]]; then
             if [[ -n $(git status --porcelain) ]]; then
               echo
               echo "ERROR: Uncommitted changes found in ${PRJ}/"
               echo "       You may force overwriting these changes"
               echo "       with |source build/envsetup.sh force|"
               echo
               exit 1
             fi
           fi
           # Ensure the project is clean before applying patches to it
           git reset --hard HEAD
           git clean -dfx
         done
         popd > /dev/null

         # Generate list of patches, skip if patch already exists
         # Store list of patches like this: "patch_tree:remaining_patch_path"
         PATCH_LIST=
         echo Finding patches...
         for TREE in ${PATCH_TREE}; do
           PATCHES=$(find -L $TREE -name \*.patch | sort -fs)
           for PATCH in ${PATCHES}; do
             PATCH_WO_TREE=${PATCH#${TREE}}
             if [[ $PATCH_LIST =~ ([^ ]*):$PATCH_WO_TREE ]]; then
               echo "  skipping $PATCH, exists already in ${BASH_REMATCH[1]}"
             else
               PATCH_LIST+=" ${TREE}:${PATCH_WO_TREE} "
             fi
           done  
         done

         #
         # Walk through all the patches and apply them
         #
         echo Patching...
         for P in ${PATCH_LIST}; do
           TREE=`echo $P | cut -d \: -f 1`
           PATCH_WO_TREE=`echo $P | cut -d \: -f 2`
           PATCH=$TREE$PATCH_WO_TREE

           PRJ=$(dirname ${PATCH#${TREE}})
           PRJ=`echo $PRJ | sed -e 's%^/%%'`
           if [[ ! -d $PRJ ]]; then
             continue
           fi
           echo -n "  "
           ( set -x ; git -C $PRJ am --quiet ${ROOT_DIR}/$PATCH )
         done

         echo $(__tree_md5sum ${PATCH_TREE}) > out/lastpatch.md5sum
      fi
   )
   ERR=$?

   if [[ ${ERR} -ne 0 ]]; then
      echo Error: patches failed to apply
      lunch() { echo Error: lunch has been disabled due to patching failure;  return 1; }
      choosecombo() { lunch; }
   fi
   return ${ERR}
}


if [[ -z $1 ]]; then
   __patch_tree
else
   case $1 in
   clean) __abandon_tree force ;;
   force) __patch_tree force ;;
   np) echo "Skipping patch tree step...";;
   *) [[ -z "$PS1" ]] && __patch_tree || echo Error: Unknown command: $1
   esac
fi
